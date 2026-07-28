#!/usr/bin/env node
/**
 * Build-time manifest of git commits for the compare UI (static Pages).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listCommits, runGit, TXT_REL, YAML_REL } from "./lib/book-git.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const OUT = path.join(WEB_ROOT, "public/book-commits.json");

const head = runGit(["rev-parse", "HEAD"], { allowFail: true })?.trim();
if (!head) {
  console.warn("gen-book-commits: bukan repo git — lewati.");
  process.exit(0);
}

const remote =
  runGit(["config", "--get", "remote.origin.url"], { allowFail: true })?.trim() ?? "";
let repo = "ianyulianto/ianyulianto.github.io";
const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
if (m) repo = m[1];

const branch =
  runGit(["symbolic-ref", "--short", "refs/heads/HEAD"], { allowFail: true })?.trim() ??
  runGit(["rev-parse", "--abbrev-ref", "HEAD"], { allowFail: true })?.trim() ??
  "master";

const commits = listCommits({ limit: 40 }).map((c) => ({
  sha: c.sha,
  short: c.short,
  date: c.date,
  subject: c.subject,
  files: c.paths.map((p) => (p.endsWith("book.txt") ? "txt" : p.endsWith("book.yaml") ? "yaml" : p)),
}));

const manifest = {
  generatedAt: new Date().toISOString(),
  repo,
  branch,
  head,
  paths: { txt: TXT_REL, yaml: YAML_REL },
  commits,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`gen-book-commits: ${commits.length} commit → public/book-commits.json`);
