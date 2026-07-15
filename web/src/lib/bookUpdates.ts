import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

export type UpdateStatus = "new" | "updated";
export type ContentKind = "prose" | "poetry";

export type BlockUpdate = {
  /** `${partSlug}:${blockIndex}` — blockIndex is position in part.blocks (incl. dividers) */
  key: string;
  partSlug: string;
  partLabel: string;
  partTitle: string;
  kind: ContentKind;
  blockIndex: number;
  status: UpdateStatus;
  /** ISO date when the block was first added or last updated */
  since: string;
  /** Short preview of current text */
  preview: string;
  /** Previous preview when status is "updated" */
  previousPreview?: string;
};

export type BookUpdates = {
  newBlocks: BlockUpdate[];
  updatedBlocks: BlockUpdate[];
  /** Lookup by `${partSlug}:${blockIndex}` → update info */
  byBlockKey: Record<string, BlockUpdate>;
  /** Parts that contain at least one new/updated block (for TOC hints) */
  partsWithUpdates: Record<string, UpdateStatus>;
  windowDays: number;
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

type SnapshotBlock = {
  kind: ContentKind;
  /** Index in the raw part.blocks array (including dividers) — for UI anchors */
  blockIndex: number;
  fingerprint: string;
  preview: string;
  text: string;
};

type SnapshotPart = {
  slug: string;
  label: string;
  title: string;
  blocks: SnapshotBlock[];
};

export type DiffBlock = {
  partSlug: string;
  partLabel: string;
  partTitle: string;
  kind: ContentKind;
  blockIndex: number;
  preview: string;
  text: string;
  previousPreview?: string;
  previousText?: string;
};

const REPO_ROOT = path.resolve(process.cwd(), "..");
const YAML_REL = "web/content/book.yaml";
const YAML_ABS = path.resolve(process.cwd(), "content/book.yaml");

/** How long the latest update batch keeps “baru” / “diubah” marks */
const DEFAULT_WINDOW_DAYS = 30;
const PREVIEW_LEN = 96;

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

function clipPreview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  return oneLine.length > PREVIEW_LEN ? `${oneLine.slice(0, PREVIEW_LEN - 1)}…` : oneLine;
}

/**
 * Build before/after previews centered on the first textual difference,
 * so PR comments and UI show what actually changed.
 */
export function changePreviews(beforeText: string, afterText: string): {
  previousPreview: string;
  preview: string;
} {
  const a = beforeText.replace(/\s+/g, " ").trim();
  const b = afterText.replace(/\s+/g, " ").trim();
  if (!a && !b) return { previousPreview: "", preview: "" };
  if (a === b) return { previousPreview: clipPreview(a), preview: clipPreview(b) };

  let start = 0;
  const minLen = Math.min(a.length, b.length);
  while (start < minLen && a[start] === b[start]) start++;

  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }

  const window = Math.floor(PREVIEW_LEN * 0.55);
  const sliceAround = (text: string, from: number, to: number) => {
    const left = Math.max(0, from - window);
    const right = Math.min(text.length, to + window + 1);
    let out = text.slice(left, right).trim();
    if (left > 0) out = `…${out}`;
    if (right < text.length) out = `${out}…`;
    if (out.length > PREVIEW_LEN) {
      out = `${out.slice(0, PREVIEW_LEN - 1)}…`;
    }
    return out;
  };

  return {
    previousPreview: sliceAround(a, start, endA),
    preview: sliceAround(b, start, endB),
  };
}

function normalizeBlock(raw: unknown, blockIndex: number): SnapshotBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as YamlBlock;
  const kindRaw = asString(block.kind, "prose").toLowerCase();

  if (kindRaw === "divider") return null;

  if (kindRaw === "poetry") {
    const lines = Array.isArray(block.lines)
      ? block.lines.map((l) => (typeof l === "string" ? l : ""))
      : [];
    const text = lines.join("\n").replace(/\r\n/g, "\n");
    if (!text.replace(/\s+/g, "").length) return null;
    return {
      kind: "poetry",
      blockIndex,
      fingerprint: JSON.stringify({ kind: "poetry", lines }),
      preview: clipPreview(lines.filter((l) => l.trim()).join(" / ") || text),
      text,
    };
  }

  // prose
  let text = "";
  if (typeof block.text === "string") {
    text = block.text.replace(/\r\n/g, "\n").trim();
  } else if (Array.isArray(block.lines)) {
    text = block.lines
      .map((l) => (typeof l === "string" ? l.trim() : ""))
      .filter(Boolean)
      .join("\n");
  }
  if (!text) return null;
  return {
    kind: "prose",
    blockIndex,
    fingerprint: JSON.stringify({ kind: "prose", text }),
    preview: clipPreview(text),
    text,
  };
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

    const blocks: SnapshotBlock[] = [];
    if (Array.isArray(part.blocks)) {
      part.blocks.forEach((rawBlock, i) => {
        const normalized = normalizeBlock(rawBlock, i);
        if (normalized) blocks.push(normalized);
      });
    }

    out.push({ slug, label, title, blocks });
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

function blockKey(partSlug: string, blockIndex: number): string {
  return `${partSlug}:${blockIndex}`;
}

/** Word-overlap similarity in [0, 1]. Used to pair edits, not unrelated inserts. */
function textSimilarity(a: string, b: string): number {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  const wa = tokenize(a);
  const wb = tokenize(b);
  if (wa.length === 0 || wb.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const w of wa) counts.set(w, (counts.get(w) ?? 0) + 1);
  let overlap = 0;
  for (const w of wb) {
    const n = counts.get(w) ?? 0;
    if (n > 0) {
      overlap++;
      counts.set(w, n - 1);
    }
  }
  return (2 * overlap) / (wa.length + wb.length);
}

/** Minimum similarity to treat unmatched same-kind blocks as an edit. */
const UPDATE_SIMILARITY_THRESHOLD = 0.35;

/**
 * LCS on fingerprints, then pair leftover same-kind blocks by text similarity.
 */
export function diffBlockLists(
  before: SnapshotBlock[],
  after: SnapshotBlock[],
): {
  added: SnapshotBlock[];
  removed: SnapshotBlock[];
  updated: { before: SnapshotBlock; after: SnapshotBlock }[];
} {
  const n = before.length;
  const m = after.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (before[i].fingerprint === after[j].fingerprint) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const matchedBefore = new Set<number>();
  const matchedAfter = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i].fingerprint === after[j].fingerprint) {
      matchedBefore.add(i);
      matchedAfter.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  const unmatchedBefore = before
    .map((b, idx) => ({ b, idx }))
    .filter(({ idx }) => !matchedBefore.has(idx));
  const unmatchedAfter = after
    .map((b, idx) => ({ b, idx }))
    .filter(({ idx }) => !matchedAfter.has(idx));

  type Cand = { bi: number; aj: number; score: number; dist: number };
  const candidates: Cand[] = [];
  for (let bi = 0; bi < unmatchedBefore.length; bi++) {
    for (let aj = 0; aj < unmatchedAfter.length; aj++) {
      const left = unmatchedBefore[bi];
      const right = unmatchedAfter[aj];
      if (left.b.kind !== right.b.kind) continue;
      const score = textSimilarity(left.b.text, right.b.text);
      if (score < UPDATE_SIMILARITY_THRESHOLD) continue;
      candidates.push({
        bi,
        aj,
        score,
        dist: Math.abs(left.idx - right.idx),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.dist - b.dist);

  const updated: { before: SnapshotBlock; after: SnapshotBlock }[] = [];
  const usedBefore = new Set<number>();
  const usedAfter = new Set<number>();

  for (const c of candidates) {
    if (usedBefore.has(c.bi) || usedAfter.has(c.aj)) continue;
    usedBefore.add(c.bi);
    usedAfter.add(c.aj);
    updated.push({
      before: unmatchedBefore[c.bi].b,
      after: unmatchedAfter[c.aj].b,
    });
  }

  const removed = unmatchedBefore.filter((_, idx) => !usedBefore.has(idx)).map(({ b }) => b);
  const added = unmatchedAfter.filter((_, idx) => !usedAfter.has(idx)).map(({ b }) => b);

  return { added, removed, updated };
}

export type PartBlockDiff = {
  partSlug: string;
  partLabel: string;
  partTitle: string;
  added: SnapshotBlock[];
  removed: SnapshotBlock[];
  updated: { before: SnapshotBlock; after: SnapshotBlock }[];
  titleChanged: boolean;
};

/**
 * Diff two part snapshots at prose/poetry block granularity.
 */
export function diffPartBlockSnapshots(
  before: SnapshotPart[],
  after: SnapshotPart[],
): {
  addedParts: SnapshotPart[];
  removedParts: SnapshotPart[];
  partDiffs: PartBlockDiff[];
} {
  const prev = new Map(before.map((p) => [p.slug, p]));
  const next = new Map(after.map((p) => [p.slug, p]));

  const addedParts: SnapshotPart[] = [];
  const removedParts: SnapshotPart[] = [];
  const partDiffs: PartBlockDiff[] = [];

  for (const part of after) {
    const old = prev.get(part.slug);
    if (!old) {
      addedParts.push(part);
      continue;
    }
    const { added, removed, updated } = diffBlockLists(old.blocks, part.blocks);
    const titleChanged = old.title !== part.title || old.label !== part.label;
    if (added.length || removed.length || updated.length || titleChanged) {
      partDiffs.push({
        partSlug: part.slug,
        partLabel: part.label,
        partTitle: part.title,
        added,
        removed,
        updated,
        titleChanged,
      });
    }
  }

  for (const part of before) {
    if (!next.has(part.slug)) removedParts.push(part);
  }

  return { addedParts, removedParts, partDiffs };
}

function toDiffBlock(
  part: { slug: string; label: string; title: string },
  block: SnapshotBlock,
  previous?: SnapshotBlock,
): DiffBlock {
  if (previous) {
    const previews = changePreviews(previous.text, block.text);
    return {
      partSlug: part.slug,
      partLabel: part.label,
      partTitle: part.title,
      kind: block.kind,
      blockIndex: block.blockIndex,
      preview: previews.preview,
      text: block.text,
      previousPreview: previews.previousPreview,
      previousText: previous.text,
    };
  }
  return {
    partSlug: part.slug,
    partLabel: part.label,
    partTitle: part.title,
    kind: block.kind,
    blockIndex: block.blockIndex,
    preview: block.preview,
    text: block.text,
  };
}

/**
 * Flatten a part-level block diff into lists of block changes (for PR reports).
 */
export function flattenBlockDiff(result: ReturnType<typeof diffPartBlockSnapshots>): {
  added: DiffBlock[];
  updated: DiffBlock[];
  removed: DiffBlock[];
} {
  const added: DiffBlock[] = [];
  const updated: DiffBlock[] = [];
  const removed: DiffBlock[] = [];

  for (const part of result.addedParts) {
    for (const block of part.blocks) {
      added.push(toDiffBlock(part, block));
    }
  }

  for (const part of result.removedParts) {
    for (const block of part.blocks) {
      removed.push(toDiffBlock(part, block));
    }
  }

  for (const diff of result.partDiffs) {
    const partMeta = {
      slug: diff.partSlug,
      label: diff.partLabel,
      title: diff.partTitle,
    };
    for (const block of diff.added) {
      added.push(toDiffBlock(partMeta, block));
    }
    for (const block of diff.removed) {
      removed.push(toDiffBlock(partMeta, block));
    }
    for (const pair of diff.updated) {
      updated.push(toDiffBlock(partMeta, pair.after, pair.before));
    }
  }

  return { added, updated, removed };
}

/**
 * Detect prose/poetry blocks that are new or updated in the *latest* book.yaml
 * change only (not every change within the recency window).
 *
 * Compares the working tree tip to the previous committed version of
 * `web/content/book.yaml`. Badges expire after `BOOK_NEW_DAYS` (default 30)
 * from that latest change date.
 */
export function loadBookUpdates(): BookUpdates {
  const days = windowDays();
  const empty: BookUpdates = {
    newBlocks: [],
    updatedBlocks: [],
    byBlockKey: {},
    partsWithUpdates: {},
    windowDays: days,
    available: false,
  };

  const currentRaw = readCurrentYaml();
  if (!currentRaw) return empty;

  const tipParts = parsePartsFromYaml(currentRaw);
  if (tipParts.length === 0) return empty;

  const commits = listBookCommits();
  if (commits.length === 0) {
    return { ...empty, available: false };
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const head = commits[0];
  const headParts = parsePartsFromYaml(yamlAt(head.sha));
  const tipVsHead = flattenBlockDiff(diffPartBlockSnapshots(headParts, tipParts));
  const tipHasContentChanges =
    tipVsHead.added.length > 0 || tipVsHead.updated.length > 0 || tipVsHead.removed.length > 0;

  let beforeParts: SnapshotPart[];
  let since: string;

  if (tipHasContentChanges) {
    // Uncommitted tip edits are the current “latest” batch
    beforeParts = headParts;
    since = new Date().toISOString();
  } else if (commits.length >= 2) {
    // Tip matches HEAD — only show marks from the latest committed change
    beforeParts = parsePartsFromYaml(yamlAt(commits[1].sha));
    since = head.date;
  } else {
    // Single commit is the baseline; nothing is “baru” relative to it
    return { ...empty, available: true };
  }

  const sinceMs = Date.parse(since);
  if (!Number.isFinite(sinceMs) || sinceMs < cutoff) {
    return { ...empty, available: true };
  }

  const flat = flattenBlockDiff(diffPartBlockSnapshots(beforeParts, tipParts));
  const newBlocks: BlockUpdate[] = [];
  const updatedBlocks: BlockUpdate[] = [];
  const byBlockKey: Record<string, BlockUpdate> = {};
  const partsWithUpdates: Record<string, UpdateStatus> = {};

  const markPart = (slug: string, status: UpdateStatus) => {
    const existing = partsWithUpdates[slug];
    if (!existing || (existing === "updated" && status === "new")) {
      partsWithUpdates[slug] = status;
    }
  };

  for (const b of flat.added) {
    const key = blockKey(b.partSlug, b.blockIndex);
    const item: BlockUpdate = {
      key,
      partSlug: b.partSlug,
      partLabel: b.partLabel,
      partTitle: b.partTitle,
      kind: b.kind,
      blockIndex: b.blockIndex,
      status: "new",
      since,
      preview: b.preview,
    };
    newBlocks.push(item);
    byBlockKey[key] = item;
    markPart(b.partSlug, "new");
  }

  for (const b of flat.updated) {
    const key = blockKey(b.partSlug, b.blockIndex);
    const item: BlockUpdate = {
      key,
      partSlug: b.partSlug,
      partLabel: b.partLabel,
      partTitle: b.partTitle,
      kind: b.kind,
      blockIndex: b.blockIndex,
      status: "updated",
      since,
      preview: b.preview,
      previousPreview: b.previousPreview,
    };
    updatedBlocks.push(item);
    byBlockKey[key] = item;
    markPart(b.partSlug, "updated");
  }

  return {
    newBlocks,
    updatedBlocks,
    byBlockKey,
    partsWithUpdates,
    windowDays: days,
    available: true,
  };
}

/**
 * Diff current working tree book.yaml against a git ref (e.g. origin/master).
 */
export function diffBookAgainstRef(ref: string): {
  added: DiffBlock[];
  updated: DiffBlock[];
  removed: DiffBlock[];
  titleOnlyParts: { slug: string; label: string; title: string }[];
} {
  const beforeRaw = runGit(["show", `${ref}:${YAML_REL}`]) ?? "";
  const afterRaw = readCurrentYaml();
  const before = parsePartsFromYaml(beforeRaw);
  const after = parsePartsFromYaml(afterRaw);
  const result = diffPartBlockSnapshots(before, after);
  const flat = flattenBlockDiff(result);
  const titleOnlyParts = result.partDiffs
    .filter(
      (d) =>
        d.titleChanged &&
        d.added.length === 0 &&
        d.removed.length === 0 &&
        d.updated.length === 0,
    )
    .map((d) => ({ slug: d.partSlug, label: d.partLabel, title: d.partTitle }));
  return { ...flat, titleOnlyParts };
}

function kindLabel(kind: ContentKind): string {
  return kind === "poetry" ? "puisi" : "prosa";
}

function formatBlockLine(b: DiffBlock, withPrevious = false): string {
  const where = `**${b.partLabel}** — ${b.partTitle}`;
  const what = `_${kindLabel(b.kind)}_`;
  if (withPrevious && b.previousPreview) {
    return `- ${where} · ${what}\n  - sebelum: “${b.previousPreview}”\n  - sesudah: “${b.preview}”`;
  }
  return `- ${where} · ${what}: “${b.preview}”`;
}

export function formatUpdatesMarkdown(diff: {
  added: DiffBlock[];
  updated: DiffBlock[];
  removed: DiffBlock[];
  titleOnlyParts?: { slug: string; label: string; title: string }[];
}): string {
  const lines: string[] = ["## Perubahan prose / poetry", ""];
  const titleOnly = diff.titleOnlyParts ?? [];

  if (
    diff.added.length === 0 &&
    diff.updated.length === 0 &&
    diff.removed.length === 0 &&
    titleOnly.length === 0
  ) {
    lines.push("_Tidak ada perubahan prose/poetry._");
    return lines.join("\n");
  }

  if (diff.added.length > 0) {
    lines.push("### Blok baru");
    for (const b of diff.added) {
      lines.push(formatBlockLine(b));
    }
    lines.push("");
  }

  if (diff.updated.length > 0) {
    lines.push("### Blok diubah");
    for (const b of diff.updated) {
      lines.push(formatBlockLine(b, true));
    }
    lines.push("");
  }

  if (diff.removed.length > 0) {
    lines.push("### Blok dihapus");
    for (const b of diff.removed) {
      lines.push(formatBlockLine(b));
    }
    lines.push("");
  }

  if (titleOnly.length > 0) {
    lines.push("### Judul/label chapter diubah (tanpa ubah isi blok)");
    for (const p of titleOnly) {
      lines.push(`- **${p.label}** — ${p.title} (\`${p.slug}\`)`);
    }
    lines.push("");
  }

  lines.push(
    "_Tanda “baru” / “diubah” di situs hanya dari update `book.yaml` terakhir (±30 hari), menempel di blok prose/poetry — bukan seluruh chapter._",
  );
  return lines.join("\n");
}
