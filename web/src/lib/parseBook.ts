import fs from "node:fs";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

export type BlockKind = "prose" | "poetry" | "divider";

export type BookBlock = {
  kind: BlockKind;
  /** Poetry lines ("" = stanza break). Prose paragraphs. Divider unused. */
  lines: string[];
};

export type BookPart = {
  index: number;
  slug: string;
  /** e.g. "Pembuka" or "Chapter 1" */
  label: string;
  title: string;
  preview: string;
  blocks: BookBlock[];
};

export type BookMeta = {
  title: string;
  author: string;
  tagline: string;
  language: string;
};

export type BookSource = "yaml" | "empty";

export type Book = {
  meta: BookMeta;
  parts: BookPart[];
  source: BookSource;
};

const CONTENT_DIR = path.resolve(process.cwd(), "content");
const YAML_PATH = path.join(CONTENT_DIR, "book.yaml");

const DEFAULT_META: BookMeta = {
  title: "Judul Buku",
  author: "Nama Penulis",
  tagline: "Sebuah booklet untuk dibaca pelan-pelan.",
  language: "id",
};

type YamlBlock = {
  kind?: string;
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
  meta?: Partial<BookMeta>;
  parts?: unknown;
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeProseText(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);
}

function normalizePoetryLines(lines: unknown): string[] {
  if (!Array.isArray(lines)) return [];
  const out = lines.map((line) => (typeof line === "string" ? line.replace(/\s+$/g, "") : ""));
  while (out.length > 0 && out[0].trim().length === 0) out.shift();
  while (out.length > 0 && out[out.length - 1].trim().length === 0) out.pop();
  return out;
}

function normalizeBlock(raw: unknown): BookBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const block = raw as YamlBlock;
  const kindRaw = asString(block.kind, "prose").toLowerCase();

  if (kindRaw === "divider") {
    return { kind: "divider", lines: [] };
  }

  if (kindRaw === "poetry") {
    const lines = normalizePoetryLines(block.lines);
    if (lines.length === 0) return null;
    return { kind: "poetry", lines };
  }

  // prose (default)
  if (typeof block.text === "string" && block.text.trim()) {
    const lines = normalizeProseText(block.text);
    if (lines.length === 0) return null;
    return { kind: "prose", lines };
  }

  if (Array.isArray(block.lines)) {
    const lines = block.lines
      .map((line) => (typeof line === "string" ? line.trim() : ""))
      .filter(Boolean);
    if (lines.length === 0) return null;
    return { kind: "prose", lines };
  }

  return null;
}

function previewFrom(blocks: BookBlock[]): string {
  const line = blocks
    .filter((b) => b.kind !== "divider")
    .flatMap((b) => b.lines)
    .find((l) => l.trim().length > 0);
  if (!line) return "";
  const trimmed = line.trim();
  return trimmed.length > 96 ? `${trimmed.slice(0, 93)}…` : trimmed;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function normalizePart(raw: unknown, index: number): BookPart | null {
  if (!raw || typeof raw !== "object") return null;
  const part = raw as YamlPart;
  const title = asString(part.title).trim() || `Bagian ${index}`;
  const label = asString(part.label).trim() || `Bagian ${index}`;
  const slug =
    asString(part.slug).trim() ||
    slugify(title) ||
    String(index);

  const blocks = Array.isArray(part.blocks)
    ? part.blocks.map(normalizeBlock).filter((b): b is BookBlock => b !== null)
    : [];

  return {
    index,
    slug,
    label,
    title,
    preview: previewFrom(blocks),
    blocks,
  };
}

export function loadBook(): Book {
  if (!fs.existsSync(YAML_PATH)) {
    return { meta: DEFAULT_META, parts: [], source: "empty" };
  }

  const raw = fs.readFileSync(YAML_PATH, "utf8");
  const doc = (loadYaml(raw) ?? {}) as YamlBook;
  const meta: BookMeta = { ...DEFAULT_META, ...(doc.meta ?? {}) };

  const parts = Array.isArray(doc.parts)
    ? doc.parts
        .map((part, i) => normalizePart(part, i + 1))
        .filter((p): p is BookPart => p !== null)
    : [];

  // Ensure unique slugs
  const seen = new Map<string, number>();
  for (const part of parts) {
    const base = part.slug;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count > 0) part.slug = `${base}-${count + 1}`;
  }

  return { meta, parts, source: "yaml" };
}

export function hasBookSource(): boolean {
  return fs.existsSync(YAML_PATH);
}
