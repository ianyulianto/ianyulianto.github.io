#!/usr/bin/env node
/**
 * Git-style compare for book.txt / book.yaml between chosen commits.
 *
 *   node scripts/book-compare.mjs list [-n 25]
 *   node scripts/book-compare.mjs compare --from <ref> [--to <ref>] [--txt|--yaml|--all]
 *   node scripts/book-compare.mjs compare -i [--to <ref>]   # pilih commit dasar (TTY)
 *
 * Default --to: HEAD (atau working tree jika file berubah belum di-commit).
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  TXT_REL,
  YAML_REL,
  gitUnifiedDiff,
  listCommits,
  pathIsDirty,
  resolveRef,
  shortSha,
} from "./lib/book-git.mjs";

function usage() {
  console.error(`Usage:
  book-compare.mjs list [-n <jumlah>]
  book-compare.mjs compare --from <ref> [--to <ref>] [--txt|--yaml|--all]
  book-compare.mjs compare -i [--to <ref>] [--txt|--yaml|--all]

  --from / --to   commit, tag, atau ref git (mis. HEAD~3, bd06b79)
  -i, --pick      pilih commit dasar dari daftar (interaktif)
  --txt           hanya book.txt (default)
  --yaml          hanya book.yaml
  --all           book.txt dan book.yaml`);
}

function parseArgv(argv) {
  const out = {
    cmd: null,
    from: null,
    to: "HEAD",
    limit: 25,
    pick: false,
    scope: "txt",
    toWorktree: false,
  };

  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith("-")) {
    out.cmd = rest.shift();
  }

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    switch (a) {
      case "-n":
        out.limit = Number.parseInt(rest[++i], 10) || 25;
        break;
      case "--from":
        out.from = rest[++i];
        break;
      case "--to":
        out.to = rest[++i];
        break;
      case "-i":
      case "--pick":
        out.pick = true;
        break;
      case "--txt":
        out.scope = "txt";
        break;
      case "--yaml":
        out.scope = "yaml";
        break;
      case "--all":
        out.scope = "all";
        break;
      case "--worktree":
        out.toWorktree = true;
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
      default:
        console.error(`Opsi tidak dikenal: ${a}`);
        usage();
        process.exit(1);
    }
  }
  return out;
}

function scopePaths(scope) {
  if (scope === "yaml") return [YAML_REL];
  if (scope === "all") return [TXT_REL, YAML_REL];
  return [TXT_REL];
}

function resolveToRef(opts) {
  const paths = scopePaths(opts.scope);
  const anyDirty = paths.some((p) => pathIsDirty(p));
  if (opts.toWorktree || (opts.to === "HEAD" && anyDirty)) {
    return null;
  }
  return opts.to;
}

function printHeader(fromRef, toLabel, relPath) {
  const fromSha = shortSha(resolveRef(fromRef));
  const file = relPath === TXT_REL ? "book.txt" : "book.yaml";
  process.stdout.write(`\n# diff ${file}  ${fromSha} → ${toLabel}\n\n`);
}

async function pickFromCommit(limit) {
  const commits = listCommits({ limit });
  if (commits.length === 0) {
    console.error("Tidak ada commit untuk book.txt / book.yaml.");
    process.exit(1);
  }

  console.log("Commit terbaru (book.txt / book.yaml):\n");
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const files = c.paths.length ? c.paths.map((p) => p.split("/").pop()).join(", ") : "—";
    console.log(
      `  ${String(i + 1).padStart(2)}. ${c.short}  ${c.date.slice(0, 16)}  [${files}]  ${c.subject}`,
    );
  }
  console.log("");

  if (!input.isTTY) {
    console.error("Mode -i membutuhkan terminal. Pakai --from <ref> atau lihat: npm run book:commits");
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });
  const answer = (await rl.question("Nomor atau ref git untuk --from: ")).trim();
  rl.close();

  if (!answer) {
    console.error("Dibatalkan.");
    process.exit(1);
  }

  const n = Number.parseInt(answer, 10);
  if (Number.isFinite(n) && n >= 1 && n <= commits.length) {
    return commits[n - 1].sha;
  }
  return resolveRef(answer);
}

function cmdList(opts) {
  const commits = listCommits({ limit: opts.limit });
  if (commits.length === 0) {
    console.log("(kosong)");
    return;
  }
  for (const c of commits) {
    const files = c.paths.length ? c.paths.map((p) => p.split("/").pop()).join(", ") : "—";
    console.log(`${c.short}  ${c.date.slice(0, 19)}  [${files}]  ${c.subject}`);
  }
}

async function cmdCompare(opts) {
  let from = opts.from;
  if (opts.pick || !from) {
    from = await pickFromCommit(opts.limit);
  }

  const toRef = resolveToRef(opts);
  const toLabel = toRef == null ? "working tree" : shortSha(resolveRef(toRef));
  const paths = scopePaths(opts.scope);

  let any = false;
  for (const rel of paths) {
    const patch = gitUnifiedDiff(from, toRef, rel);
    if (!patch) continue;
    any = true;
    printHeader(from, toLabel, rel);
    process.stdout.write("```diff\n");
    process.stdout.write(patch);
    process.stdout.write("\n```\n");
  }

  if (!any) {
    process.stdout.write(
      `_Tidak ada perbedaan (${scopePaths(opts.scope).join(", ")}) antara ${shortSha(resolveRef(from))} dan ${toLabel}._\n`,
    );
  }
}

const opts = parseArgv(process.argv.slice(2));
if (!opts.cmd) {
  usage();
  process.exit(1);
}

if (opts.cmd === "list" || opts.cmd === "commits") {
  cmdList(opts);
} else if (opts.cmd === "compare" || opts.cmd === "diff") {
  await cmdCompare(opts);
} else {
  console.error(`Perintah tidak dikenal: ${opts.cmd}`);
  usage();
  process.exit(1);
}
