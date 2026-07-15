#!/usr/bin/env node
/**
 * Compare book.yaml against a git ref and print a markdown report
 * of prose/poetry block changes (not whole chapters).
 * Usage: node scripts/book-updates-report.mjs [base-ref]
 * Default base-ref: origin/master
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

// Keep algorithms in sync with web/src/lib/bookUpdates.ts (Node script cannot import .ts).

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");

const YAML_REL = "web/content/book.yaml";
const YAML_ABS = path.join(WEB_ROOT, "content/book.yaml");
const PREVIEW_LEN = 96;

const baseRef = process.argv[2] || "origin/master";

function runGit(args) {
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

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function clipPreview(text) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  return oneLine.length > PREVIEW_LEN ? `${oneLine.slice(0, PREVIEW_LEN - 1)}…` : oneLine;
}

function changePreviews(beforeText, afterText) {
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
  const sliceAround = (text, from, to) => {
    const left = Math.max(0, from - window);
    const right = Math.min(text.length, to + window + 1);
    let out = text.slice(left, right).trim();
    if (left > 0) out = `…${out}`;
    if (right < text.length) out = `${out}…`;
    if (out.length > PREVIEW_LEN) out = `${out.slice(0, PREVIEW_LEN - 1)}…`;
    return out;
  };

  return {
    previousPreview: sliceAround(a, start, endA),
    preview: sliceAround(b, start, endB),
  };
}

function normalizeBlock(raw, blockIndex) {
  if (!raw || typeof raw !== "object") return null;
  const kindRaw = asString(raw.kind, "prose").toLowerCase();
  if (kindRaw === "divider") return null;

  if (kindRaw === "poetry") {
    const lines = Array.isArray(raw.lines)
      ? raw.lines.map((l) => (typeof l === "string" ? l : ""))
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

  let text = "";
  if (typeof raw.text === "string") {
    text = raw.text.replace(/\r\n/g, "\n").trim();
  } else if (Array.isArray(raw.lines)) {
    text = raw.lines
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

function parseParts(raw) {
  if (!raw?.trim()) return [];
  let doc;
  try {
    doc = loadYaml(raw) ?? {};
  } catch {
    return [];
  }
  if (!Array.isArray(doc.parts)) return [];

  const out = [];
  const seen = new Map();
  for (const rawPart of doc.parts) {
    if (!rawPart || typeof rawPart !== "object") continue;
    const title = asString(rawPart.title).trim() || "Bagian";
    const label = asString(rawPart.label).trim() || title;
    let slug = asString(rawPart.slug).trim();
    if (!slug) continue;
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count + 1}`;

    const blocks = [];
    if (Array.isArray(rawPart.blocks)) {
      rawPart.blocks.forEach((rawBlock, i) => {
        const normalized = normalizeBlock(rawBlock, i);
        if (normalized) blocks.push(normalized);
      });
    }
    out.push({ slug, label, title, blocks });
  }
  return out;
}

function textSimilarity(a, b) {
  const tokenize = (s) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean);
  const wa = tokenize(a);
  const wb = tokenize(b);
  if (wa.length === 0 || wb.length === 0) return 0;
  const counts = new Map();
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

const UPDATE_SIMILARITY_THRESHOLD = 0.35;

function diffBlockLists(before, after) {
  const n = before.length;
  const m = after.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (before[i].fingerprint === after[j].fingerprint) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const matchedBefore = new Set();
  const matchedAfter = new Set();
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

  const candidates = [];
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

  const updated = [];
  const usedBefore = new Set();
  const usedAfter = new Set();
  for (const c of candidates) {
    if (usedBefore.has(c.bi) || usedAfter.has(c.aj)) continue;
    usedBefore.add(c.bi);
    usedAfter.add(c.aj);
    updated.push({ before: unmatchedBefore[c.bi].b, after: unmatchedAfter[c.aj].b });
  }

  const removed = unmatchedBefore.filter((_, idx) => !usedBefore.has(idx)).map(({ b }) => b);
  const added = unmatchedAfter.filter((_, idx) => !usedAfter.has(idx)).map(({ b }) => b);
  return { added, removed, updated };
}

function diffParts(before, after) {
  const prev = new Map(before.map((p) => [p.slug, p]));
  const next = new Map(after.map((p) => [p.slug, p]));
  const addedParts = [];
  const removedParts = [];
  const partDiffs = [];

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

function kindLabel(kind) {
  return kind === "poetry" ? "puisi" : "prosa";
}

function formatBlockLine(partLabel, partTitle, kind, preview, previousPreview) {
  const where = `**${partLabel}** — ${partTitle}`;
  const what = `_${kindLabel(kind)}_`;
  if (previousPreview) {
    return `- ${where} · ${what}\n  - sebelum: “${previousPreview}”\n  - sesudah: “${preview}”`;
  }
  return `- ${where} · ${what}: “${preview}”`;
}

const beforeRaw = runGit(["show", `${baseRef}:${YAML_REL}`]) ?? "";
const afterRaw = fs.existsSync(YAML_ABS) ? fs.readFileSync(YAML_ABS, "utf8") : "";
const { addedParts, removedParts, partDiffs } = diffParts(parseParts(beforeRaw), parseParts(afterRaw));

const added = [];
const updated = [];
const removed = [];
const titleOnly = [];

for (const part of addedParts) {
  for (const block of part.blocks) {
    added.push({ part, block });
  }
}
for (const part of removedParts) {
  for (const block of part.blocks) {
    removed.push({ part, block });
  }
}
for (const diff of partDiffs) {
  const part = { slug: diff.partSlug, label: diff.partLabel, title: diff.partTitle };
  for (const block of diff.added) added.push({ part, block });
  for (const block of diff.removed) removed.push({ part, block });
  for (const pair of diff.updated) {
    updated.push({ part, block: pair.after, previous: pair.before });
  }
  if (
    diff.titleChanged &&
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.updated.length === 0
  ) {
    titleOnly.push(part);
  }
}

const lines = ["## Perubahan prose / poetry", ""];

if (added.length === 0 && updated.length === 0 && removed.length === 0 && titleOnly.length === 0) {
  lines.push("_Tidak ada perubahan prose/poetry._");
} else {
  if (added.length > 0) {
    lines.push("### Blok baru");
    for (const { part, block } of added) {
      lines.push(formatBlockLine(part.label, part.title, block.kind, block.preview));
    }
    lines.push("");
  }
  if (updated.length > 0) {
    lines.push("### Blok diubah");
    for (const { part, block, previous } of updated) {
      const previews = changePreviews(previous.text, block.text);
      lines.push(
        formatBlockLine(
          part.label,
          part.title,
          block.kind,
          previews.preview,
          previews.previousPreview,
        ),
      );
    }
    lines.push("");
  }
  if (removed.length > 0) {
    lines.push("### Blok dihapus");
    for (const { part, block } of removed) {
      lines.push(formatBlockLine(part.label, part.title, block.kind, block.preview));
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
}

const markdown = lines.join("\n");
process.stdout.write(markdown + "\n");

if (process.env.GITHUB_OUTPUT) {
  const hasChanges =
    added.length + updated.length + removed.length + titleOnly.length > 0 ? "true" : "false";
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `has_changes=${hasChanges}\nadded_count=${added.length}\nupdated_count=${updated.length}\nremoved_count=${removed.length}\n`,
  );
}
