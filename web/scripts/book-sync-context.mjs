#!/usr/bin/env node
/**
 * Print context for incremental book.txt → book.yaml sync (AI or manual).
 * Uses the last committed book.yaml (HEAD) and book.txt changes since that sync —
 * not a full rewrite from the entire manuscript.
 *
 * Usage:
 *   node scripts/book-sync-context.mjs [yaml-ref]
 * Default yaml-ref: HEAD (latest commit touching book.yaml)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(WEB_ROOT, "..");

const YAML_REL = "web/content/book.yaml";
const TXT_REL = "web/content/book.txt";
const YAML_ABS = path.join(WEB_ROOT, "content/book.yaml");
const TXT_ABS = path.join(WEB_ROOT, "content/book.txt");

const yamlRefArg = process.argv[2];

function runGit(args, { allowFail = false, okExit = [0] } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    const code = err?.status;
    if (okExit.includes(code)) {
      return err.stdout?.toString?.() ?? "";
    }
    if (allowFail) return null;
    const msg = err?.stderr?.toString?.() || err?.message || "git failed";
    console.error(msg.trim());
    process.exit(1);
  }
}

function resolveYamlRef() {
  if (yamlRefArg) return yamlRefArg;
  const ok = runGit(["cat-file", "-e", `HEAD:${YAML_REL}`], { allowFail: true });
  if (ok !== null) return "HEAD";
  console.error(`No committed ${YAML_REL} found.`);
  process.exit(1);
}

function lastYamlCommit(ref) {
  const sha = runGit(["rev-list", "-1", ref, "--", YAML_REL], { allowFail: true })?.trim();
  if (!sha) {
    console.error(`Could not find a commit for ${YAML_REL} at ${ref}.`);
    process.exit(1);
  }
  return sha;
}

function readWorkingOrHead(relPath, absPath) {
  if (fs.existsSync(absPath)) {
    const wt = runGit(["diff", "--quiet", "HEAD", "--", relPath], { allowFail: true });
    const dirty = wt === null;
    if (dirty) return { source: "working tree", text: fs.readFileSync(absPath, "utf8") };
  }
  const text = runGit(["show", `HEAD:${relPath}`], { allowFail: true });
  if (text == null) {
    console.error(`Missing ${relPath} in working tree and HEAD.`);
    process.exit(1);
  }
  return { source: "HEAD", text };
}

function txtDiffSinceYamlSync(yamlCommitSha, { toRef = "HEAD" } = {}) {
  const args = ["diff", "--no-color", "-U3", yamlCommitSha];
  if (toRef != null) args.push(toRef);
  args.push("--", TXT_REL);
  const patch = runGit(args, { okExit: [0, 1] }).trimEnd();
  if (!patch) return { kind: "none" };
  return { kind: "patch", patch, baseCommit: yamlCommitSha };
}

function main() {
  const yamlRef = resolveYamlRef();
  const yamlCommit = lastYamlCommit(yamlRef);
  const short = yamlCommit.slice(0, 7);

  const yamlAtSync = runGit(["show", `${yamlCommit}:${YAML_REL}`]);
  const yamlDirty =
    fs.existsSync(YAML_ABS) &&
    runGit(["diff", "--quiet", yamlCommit, "--", YAML_REL], { allowFail: true }) === null;

  const { source: txtSource } = readWorkingOrHead(TXT_REL, TXT_ABS);
  const txtDirty =
    fs.existsSync(TXT_ABS) &&
    runGit(["diff", "--quiet", "HEAD", "--", TXT_REL], { allowFail: true }) === null;
  const txtDelta = txtDiffSinceYamlSync(
    yamlCommit,
    txtDirty ? { toRef: null } : { toRef: "HEAD" },
  );

  const lines = [
    "# Konteks sinkron inkremental book.yaml",
    "",
    `Commit sinkron YAML terakhir: \`${short}\` (\`${yamlCommit}\`, ref \`${yamlRef}\`).`,
    `book.txt saat ini: **${txtSource}**.`,
    "",
    "Terapkan **hanya** perubahan naskah di bawah ke `web/content/book.yaml` yang sudah ada.",
    "Jangan menulis ulang seluruh file dari naskah penuh, dan jangan mengubah bagian yang tidak tersentuh diff.",
    "",
  ];

  if (yamlDirty) {
    lines.push(
      "> **Catatan:** `book.yaml` di working tree berbeda dari commit sinkron di atas. Pakai YAML di bawah sebagai basis (dari commit), lalu gabungkan edit lokal jika perlu.",
      "",
    );
  }

  if (txtDelta.kind === "none") {
    lines.push("_Tidak ada perbedaan `book.txt` sejak sinkron YAML terakhir._", "");
  } else {
    lines.push("## Diff book.txt (sejak sinkron YAML terakhir)", "", "```diff", txtDelta.patch.trimEnd(), "```", "");
  }

  lines.push("## book.yaml basis (commit sinkron terakhir)", "", "```yaml", yamlAtSync.trimEnd(), "```", "");

  process.stdout.write(lines.join("\n"));
}

main();
