#!/usr/bin/env node
/**
 * Print context for incremental book.txt → book.yaml sync (AI or manual).
 *
 * Usage:
 *   node scripts/book-sync-context.mjs
 *   node scripts/book-sync-context.mjs --from <ref> [--to <ref>]
 *   node scripts/book-sync-context.mjs --compare --from <ref> [--to <ref>]
 *
 * Default: commit sinkron book.yaml terakhir di HEAD → diff book.txt sampai HEAD/worktree.
 */
import {
  TXT_REL,
  YAML_REL,
  YAML_ABS,
  TXT_ABS,
  gitUnifiedDiff,
  lastCommitTouching,
  pathIsDirty,
  resolveRef,
  runGit,
  shortSha,
  showFileAt,
} from "./lib/book-git.mjs";

function usage() {
  console.error(`Usage:
  book-sync-context.mjs [--from <ref>] [--to <ref>]
  book-sync-context.mjs --compare --from <ref> [--to <ref>] [--yaml-diff]

  --from    commit dasar (default: commit terakhir yang menyentuh book.yaml di HEAD)
  --to      commit/jalur akhir diff book.txt (default: HEAD, atau worktree jika book.txt kotor)
  --compare hanya cetak git diff (tanpa bundel YAML untuk AI)
  --yaml-diff  sertakan diff book.yaml (--from → --to) di output sync`);
}

function parseArgv(argv) {
  const out = {
    from: null,
    to: "HEAD",
    compare: false,
    yamlDiff: false,
    legacyYamlRef: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") out.from = argv[++i];
    else if (a === "--to") out.to = argv[++i];
    else if (a === "--compare") out.compare = true;
    else if (a === "--yaml-diff") out.yamlDiff = true;
    else if (a === "-h" || a === "--help") {
      usage();
      process.exit(0);
    } else if (!a.startsWith("-")) {
      out.legacyYamlRef = a;
    } else {
      console.error(`Opsi tidak dikenal: ${a}`);
      usage();
      process.exit(1);
    }
  }
  return out;
}

function resolveYamlBaseCommit(opts) {
  if (opts.from) return resolveRef(opts.from);
  const yamlRef = opts.legacyYamlRef ?? "HEAD";
  const sha = lastCommitTouching(yamlRef, YAML_REL);
  if (!sha) {
    console.error(`Tidak ada commit untuk ${YAML_REL}.`);
    process.exit(1);
  }
  return sha;
}

function resolveTxtToRef(opts) {
  if (opts.to && opts.to !== "HEAD") return opts.to;
  if (pathIsDirty(TXT_REL)) return null;
  return opts.to ?? "HEAD";
}

function main() {
  const opts = parseArgv(process.argv.slice(2));
  const yamlCommit = resolveYamlBaseCommit(opts);
  const short = shortSha(yamlCommit);
  const toRef = resolveTxtToRef(opts);
  const toLabel = toRef == null ? "working tree" : shortSha(resolveRef(toRef));

  const txtPatch = gitUnifiedDiff(yamlCommit, toRef, TXT_REL);
  const yamlPatch =
    opts.yamlDiff || opts.compare ? gitUnifiedDiff(yamlCommit, toRef, YAML_REL) : "";

  if (opts.compare) {
    if (txtPatch) {
      process.stdout.write(`# diff book.txt  ${short} → ${toLabel}\n\n\`\`\`diff\n${txtPatch}\n\`\`\`\n`);
    }
    if (yamlPatch) {
      process.stdout.write(`\n# diff book.yaml  ${short} → ${toLabel}\n\n\`\`\`diff\n${yamlPatch}\n\`\`\`\n`);
    }
    if (!txtPatch && !yamlPatch) {
      process.stdout.write(`_Tidak ada perbedaan antara ${short} dan ${toLabel}._\n`);
    }
    return;
  }

  const yamlAtSync = showFileAt(yamlCommit, YAML_REL);
  if (yamlAtSync == null) {
    console.error(`Tidak bisa membaca ${YAML_REL} di ${short}.`);
    process.exit(1);
  }

  const yamlDirty =
    YAML_ABS &&
    runGit(["diff", "--quiet", yamlCommit, "--", YAML_REL], { allowFail: true }) === null;

  const txtSource = pathIsDirty(TXT_REL) ? "working tree" : "HEAD";

  const lines = [
    "# Konteks sinkron inkremental book.yaml",
    "",
    `Commit dasar (--from): \`${short}\` (\`${yamlCommit}\`).`,
    `Diff book.txt: \`${short}\` → **${toLabel}**.`,
    `book.txt saat ini: **${txtSource}**.`,
    "",
    "Terapkan **hanya** perubahan naskah di bawah ke `web/content/book.yaml` yang sudah ada.",
    "Jangan menulis ulang seluruh file dari naskah penuh, dan jangan mengubah bagian yang tidak tersentuh diff.",
    "",
    "_Compare git: `npm run book:compare -- compare --from <ref> [--to <ref>]` · daftar commit: `npm run book:commits`_",
    "",
  ];

  if (yamlDirty) {
    lines.push(
      "> **Catatan:** `book.yaml` di working tree berbeda dari commit dasar. Pakai YAML di bawah sebagai basis, lalu gabungkan edit lokal jika perlu.",
      "",
    );
  }

  if (!txtPatch) {
    lines.push("_Tidak ada perbedaan `book.txt` untuk rentang commit ini._", "");
  } else {
    lines.push("## Diff book.txt", "", "```diff", txtPatch, "```", "");
  }

  if (opts.yamlDiff && yamlPatch) {
    lines.push("## Diff book.yaml (referensi)", "", "```diff", yamlPatch, "```", "");
  }

  lines.push("## book.yaml basis (commit dasar)", "", "```yaml", yamlAtSync.trimEnd(), "```", "");

  process.stdout.write(lines.join("\n"));
}

main();
