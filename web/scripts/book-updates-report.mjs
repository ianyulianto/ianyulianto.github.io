#!/usr/bin/env node
/**
 * Compare book.yaml against a git ref and print a markdown report.
 * Usage: node scripts/book-updates-report.mjs [base-ref]
 * Default base-ref: origin/master
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");
const YAML_REL = "web/content/book.yaml";
const YAML_ABS = path.join(WEB_ROOT, "content/book.yaml");

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

function fingerprintBlocks(blocks) {
  if (!Array.isArray(blocks)) return "";
  const normalized = blocks.map((raw) => {
    if (!raw || typeof raw !== "object") return null;
    const kind = asString(raw.kind, "prose").toLowerCase();
    if (kind === "divider") return { kind: "divider" };
    if (kind === "poetry") {
      return {
        kind: "poetry",
        lines: Array.isArray(raw.lines)
          ? raw.lines.map((l) => (typeof l === "string" ? l : ""))
          : [],
      };
    }
    if (typeof raw.text === "string") {
      return { kind: "prose", text: raw.text.replace(/\r\n/g, "\n").trim() };
    }
    return {
      kind: "prose",
      lines: Array.isArray(raw.lines)
        ? raw.lines.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean)
        : [],
    };
  });
  return JSON.stringify(normalized);
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
    out.push({
      slug,
      label,
      title,
      fingerprint: fingerprintBlocks(rawPart.blocks),
    });
  }
  return out;
}

function diff(before, after) {
  const prev = new Map(before.map((p) => [p.slug, p]));
  const added = [];
  const updated = [];
  for (const part of after) {
    const old = prev.get(part.slug);
    if (!old) {
      added.push(part);
      continue;
    }
    if (
      old.fingerprint !== part.fingerprint ||
      old.title !== part.title ||
      old.label !== part.label
    ) {
      updated.push(part);
    }
  }
  const afterSlugs = new Set(after.map((p) => p.slug));
  const removed = before.filter((p) => !afterSlugs.has(p.slug));
  return { added, updated, removed };
}

const beforeRaw = runGit(["show", `${baseRef}:${YAML_REL}`]) ?? "";
const afterRaw = fs.existsSync(YAML_ABS) ? fs.readFileSync(YAML_ABS, "utf8") : "";
const { added, updated, removed } = diff(parseParts(beforeRaw), parseParts(afterRaw));

const lines = ["## Perubahan `book.yaml`", ""];

if (added.length === 0 && updated.length === 0 && removed.length === 0) {
  lines.push("_Tidak ada perubahan section (slug/judul/isi part)._");
} else {
  if (added.length > 0) {
    lines.push("### Bagian baru");
    for (const p of added) {
      lines.push(`- **${p.label}** — ${p.title} (\`${p.slug}\`)`);
    }
    lines.push("");
  }
  if (updated.length > 0) {
    lines.push("### Bagian diubah");
    for (const p of updated) {
      lines.push(`- **${p.label}** — ${p.title} (\`${p.slug}\`)`);
    }
    lines.push("");
  }
  if (removed.length > 0) {
    lines.push("### Bagian dihapus");
    for (const p of removed) {
      lines.push(`- **${p.label}** — ${p.title} (\`${p.slug}\`)`);
    }
    lines.push("");
  }
  lines.push(
    "_Tanda “baru” di situs aktif ±30 hari setelah section pertama kali muncul di git history._",
  );
}

const markdown = lines.join("\n");
process.stdout.write(markdown + "\n");

// Also emit machine-readable summary on stderr path via env file if requested
if (process.env.GITHUB_OUTPUT) {
  const hasChanges = added.length + updated.length + removed.length > 0 ? "true" : "false";
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `has_changes=${hasChanges}\nadded_count=${added.length}\nupdated_count=${updated.length}\nremoved_count=${removed.length}\n`,
  );
}
