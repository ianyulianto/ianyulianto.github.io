import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

export type UpdateStatus = "new" | "updated";

export type PartUpdate = {
  slug: string;
  label: string;
  title: string;
  status: UpdateStatus;
  /** ISO date when the part was first added or last updated */
  since: string;
};

export type BookUpdates = {
  /** Parts that are new within the recency window */
  newParts: PartUpdate[];
  /** Parts whose content changed within the window (not brand-new) */
  updatedParts: PartUpdate[];
  /** Lookup by slug → status */
  bySlug: Record<string, UpdateStatus>;
  /** Days used for the “baru” window */
  windowDays: number;
  /** Whether git history was available */
  available: boolean;
};

type YamlBlock = {
  kind?: unknown;
  lines?: unknown;
  text?: unknown;
};

type YamlPart = {
  slug?: unknown;
  label?: unknown;
  title?: unknown;
  blocks?: unknown;
};

type YamlBook = {
  parts?: unknown;
};

type SnapshotPart = {
  slug: string;
  label: string;
  title: string;
  fingerprint: string;
};

const REPO_ROOT = path.resolve(process.cwd(), "..");
const YAML_REL = "web/content/book.yaml";
const YAML_ABS = path.resolve(process.cwd(), "content/book.yaml");

/** How long a newly added part keeps the “baru” mark */
const DEFAULT_WINDOW_DAYS = 30;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function runGit(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

function fingerprintBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  const normalized = blocks.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const block = raw as YamlBlock;
    const kind = asString(block.kind, "prose").toLowerCase();
    if (kind === "divider") return { kind: "divider" };
    if (kind === "poetry") {
      return {
        kind: "poetry",
        lines: Array.isArray(block.lines)
          ? block.lines.map((l) => (typeof l === "string" ? l : ""))
          : [],
      };
    }
    if (typeof block.text === "string") {
      return { kind: "prose", text: block.text.replace(/\r\n/g, "\n").trim() };
    }
    return {
      kind: "prose",
      lines: Array.isArray(block.lines)
        ? block.lines.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean)
        : [],
    };
  });
  return JSON.stringify(normalized);
}

function parsePartsFromYaml(raw: string): SnapshotPart[] {
  if (!raw.trim()) return [];
  let doc: YamlBook;
  try {
    doc = (loadYaml(raw) ?? {}) as YamlBook;
  } catch {
    return [];
  }

  if (!Array.isArray(doc.parts)) return [];

  const out: SnapshotPart[] = [];
  const seen = new Map<string, number>();

  for (const rawPart of doc.parts) {
    if (!rawPart || typeof rawPart !== "object") continue;
    const part = rawPart as YamlPart;
    const title = asString(part.title).trim() || "Bagian";
    const label = asString(part.label).trim() || title;
    let slug = asString(part.slug).trim();
    if (!slug) continue;

    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count + 1}`;

    out.push({
      slug,
      label,
      title,
      fingerprint: fingerprintBlocks(part.blocks),
    });
  }

  return out;
}

function readCurrentYaml(): string {
  if (!fs.existsSync(YAML_ABS)) return "";
  return fs.readFileSync(YAML_ABS, "utf8");
}

function windowDays(): number {
  const raw = process.env.BOOK_NEW_DAYS;
  if (!raw) return DEFAULT_WINDOW_DAYS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_DAYS;
}

type CommitMeta = { sha: string; date: string };

function listBookCommits(): CommitMeta[] {
  const out = runGit(["log", "--format=%H%x09%cI", "--", YAML_REL]);
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => {
      const [sha, date] = line.split("\t");
      if (!sha || !date) return null;
      return { sha, date };
    })
    .filter((c): c is CommitMeta => c !== null);
}

function yamlAt(sha: string): string {
  return runGit(["show", `${sha}:${YAML_REL}`]) ?? "";
}

/**
 * Diff two part snapshots. Returns newly added and content-changed slugs.
 */
export function diffPartSnapshots(
  before: SnapshotPart[],
  after: SnapshotPart[],
): { added: SnapshotPart[]; updated: SnapshotPart[] } {
  const prev = new Map(before.map((p) => [p.slug, p]));
  const added: SnapshotPart[] = [];
  const updated: SnapshotPart[] = [];

  for (const part of after) {
    const old = prev.get(part.slug);
    if (!old) {
      added.push(part);
      continue;
    }
    if (old.fingerprint !== part.fingerprint || old.title !== part.title || old.label !== part.label) {
      updated.push(part);
    }
  }

  return { added, updated };
}

/**
 * Detect parts that are new or updated within the recency window,
 * using git history of `web/content/book.yaml`.
 */
export function loadBookUpdates(): BookUpdates {
  const days = windowDays();
  const empty: BookUpdates = {
    newParts: [],
    updatedParts: [],
    bySlug: {},
    windowDays: days,
    available: false,
  };

  const currentRaw = readCurrentYaml();
  if (!currentRaw) return empty;

  const currentParts = parsePartsFromYaml(currentRaw);
  if (currentParts.length === 0) return empty;

  const commits = listBookCommits();
  // Need at least one historical revision to compare against.
  // Working tree may have uncommitted edits — always treat current file as tip.
  if (commits.length === 0) {
    return { ...empty, available: false };
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  // Walk oldest → newest to find first-seen and last-changed dates.
  // The oldest commit that introduced book.yaml is the baseline: its parts
  // are not marked “baru” (avoids tagging the whole book on first import).
  const firstSeen = new Map<string, { date: string; sha: string; part: SnapshotPart }>();
  const lastChanged = new Map<string, { date: string; sha: string; part: SnapshotPart }>();
  let previous: SnapshotPart[] = [];

  const chronological = [...commits].reverse();
  const baselineSha = chronological[0]?.sha ?? "";

  for (const commit of chronological) {
    const parts = parsePartsFromYaml(yamlAt(commit.sha));
    const { added, updated } = diffPartSnapshots(previous, parts);

    for (const part of added) {
      if (!firstSeen.has(part.slug)) {
        firstSeen.set(part.slug, { date: commit.date, sha: commit.sha, part });
      }
      lastChanged.set(part.slug, { date: commit.date, sha: commit.sha, part });
    }
    for (const part of updated) {
      lastChanged.set(part.slug, { date: commit.date, sha: commit.sha, part });
    }

    previous = parts;
  }

  // Working tree / uncommitted tip vs last commit
  const tipParts = currentParts;
  const tipDate = new Date().toISOString();
  const tipSha = "__workdir__";
  const { added: tipAdded, updated: tipUpdated } = diffPartSnapshots(previous, tipParts);
  for (const part of tipAdded) {
    if (!firstSeen.has(part.slug)) {
      firstSeen.set(part.slug, { date: tipDate, sha: tipSha, part });
    }
    lastChanged.set(part.slug, { date: tipDate, sha: tipSha, part });
  }
  for (const part of tipUpdated) {
    lastChanged.set(part.slug, { date: tipDate, sha: tipSha, part });
  }

  const newParts: PartUpdate[] = [];
  const updatedParts: PartUpdate[] = [];
  const bySlug: Record<string, UpdateStatus> = {};

  for (const part of tipParts) {
    const seen = firstSeen.get(part.slug);
    const changed = lastChanged.get(part.slug);
    if (!seen) continue;

    const seenMs = Date.parse(seen.date);
    const changedMs = changed ? Date.parse(changed.date) : NaN;
    const introducedAfterBaseline = seen.sha !== baselineSha;

    if (introducedAfterBaseline && Number.isFinite(seenMs) && seenMs >= cutoff) {
      const item: PartUpdate = {
        slug: part.slug,
        label: part.label,
        title: part.title,
        status: "new",
        since: seen.date,
      };
      newParts.push(item);
      bySlug[part.slug] = "new";
      continue;
    }

    // Content edits after baseline, within the window
    if (
      changed &&
      changed.sha !== baselineSha &&
      Number.isFinite(changedMs) &&
      changedMs >= cutoff
    ) {
      const item: PartUpdate = {
        slug: part.slug,
        label: part.label,
        title: part.title,
        status: "updated",
        since: changed.date,
      };
      updatedParts.push(item);
      bySlug[part.slug] = "updated";
    }
  }

  return {
    newParts,
    updatedParts,
    bySlug,
    windowDays: days,
    available: true,
  };
}

/**
 * Diff current working tree book.yaml against a git ref (e.g. origin/master).
 * Used by CI to annotate pull requests.
 */
export function diffBookAgainstRef(ref: string): {
  added: SnapshotPart[];
  updated: SnapshotPart[];
  removed: SnapshotPart[];
} {
  const beforeRaw = runGit(["show", `${ref}:${YAML_REL}`]) ?? "";
  const afterRaw = readCurrentYaml();
  const before = parsePartsFromYaml(beforeRaw);
  const after = parsePartsFromYaml(afterRaw);
  const { added, updated } = diffPartSnapshots(before, after);
  const afterSlugs = new Set(after.map((p) => p.slug));
  const removed = before.filter((p) => !afterSlugs.has(p.slug));
  return { added, updated, removed };
}

export function formatUpdatesMarkdown(diff: {
  added: SnapshotPart[];
  updated: SnapshotPart[];
  removed: SnapshotPart[];
}): string {
  const lines: string[] = ["## Perubahan `book.yaml`", ""];

  if (diff.added.length === 0 && diff.updated.length === 0 && diff.removed.length === 0) {
    lines.push("_Tidak ada perubahan section (slug/judul/isi part)._");
    return lines.join("\n");
  }

  if (diff.added.length > 0) {
    lines.push("### Bagian baru");
    for (const p of diff.added) {
      lines.push(`- **${p.label}** — ${p.title} (\`${p.slug}\`)`);
    }
    lines.push("");
  }

  if (diff.updated.length > 0) {
    lines.push("### Bagian diubah");
    for (const p of diff.updated) {
      lines.push(`- **${p.label}** — ${p.title} (\`${p.slug}\`)`);
    }
    lines.push("");
  }

  if (diff.removed.length > 0) {
    lines.push("### Bagian dihapus");
    for (const p of diff.removed) {
      lines.push(`- **${p.label}** — ${p.title} (\`${p.slug}\`)`);
    }
    lines.push("");
  }

  lines.push("_Tanda “baru” di situs aktif ±30 hari setelah section pertama kali muncul di git history._");
  return lines.join("\n");
}
