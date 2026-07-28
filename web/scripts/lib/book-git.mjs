import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = path.resolve(__dirname, "../..");
export const REPO_ROOT = path.resolve(WEB_ROOT, "..");

export const YAML_REL = "web/content/book.yaml";
export const TXT_REL = "web/content/book.txt";
export const YAML_ABS = path.join(WEB_ROOT, "content/book.yaml");
export const TXT_ABS = path.join(WEB_ROOT, "content/book.txt");

export const CONTENT_PATHS = {
  txt: TXT_REL,
  yaml: YAML_REL,
  all: [TXT_REL, YAML_REL],
};

export function runGit(args, { allowFail = false, okExit = [0] } = {}) {
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
    throw err;
  }
}

export function resolveRef(ref) {
  const sha = runGit(["rev-parse", "--verify", ref], { allowFail: true })?.trim();
  if (!sha) {
    console.error(`Ref git tidak dikenal: ${ref}`);
    process.exit(1);
  }
  return sha;
}

export function shortSha(sha) {
  return sha.slice(0, 7);
}

/** @returns {{ sha: string, short: string, date: string, subject: string, paths: string[] }[]} */
export function listCommits({ paths = [TXT_REL, YAML_REL], limit = 25 } = {}) {
  const pathArgs = paths.flatMap((p) => ["--", p]);
  const format = "%H%x1f%ci%x1f%s";
  const raw =
    runGit(["log", `-n`, String(limit), `--format=${format}`, ...pathArgs], {
      allowFail: true,
    })?.trim() ?? "";
  if (!raw) return [];

  const commits = raw.split("\n").map((line) => {
    const [sha, date, subject] = line.split("\x1f");
    return { sha, short: shortSha(sha), date: date.trim(), subject: subject.trim(), paths: [] };
  });

  for (const c of commits) {
    const touched = runGit(["diff-tree", "--no-commit-id", "--name-only", "-r", c.sha], {
      allowFail: true,
    });
    const names = touched?.trim().split("\n").filter(Boolean) ?? [];
    c.paths = names.filter((n) => n === TXT_REL || n === YAML_REL);
  }

  return commits;
}

export function pathIsDirty(relPath) {
  const abs = relPath === TXT_REL ? TXT_ABS : relPath === YAML_REL ? YAML_ABS : null;
  if (!abs || !fs.existsSync(abs)) {
    return runGit(["diff", "--quiet", "HEAD", "--", relPath], { allowFail: true }) === null;
  }
  return runGit(["diff", "--quiet", "HEAD", "--", relPath], { allowFail: true }) === null;
}

/**
 * Unified diff between two refs (or ref → working tree when toRef is null).
 */
export function gitUnifiedDiff(fromRef, toRef, relPath) {
  const fromSha = resolveRef(fromRef);
  const args = ["diff", "--no-color", "-U3", fromSha];
  if (toRef != null && toRef !== "") {
    args.push(resolveRef(toRef));
  }
  args.push("--", relPath);
  return runGit(args, { okExit: [0, 1] }).trimEnd();
}

export function lastCommitTouching(ref, relPath) {
  return (
    runGit(["rev-list", "-1", ref, "--", relPath], { allowFail: true })?.trim() ?? null
  );
}

export function showFileAt(ref, relPath) {
  return runGit(["show", `${resolveRef(ref)}:${relPath}`], { allowFail: true });
}
