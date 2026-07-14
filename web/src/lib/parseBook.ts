import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";

export type BlockKind = "prose" | "poetry";

export type BookBlock = {
  kind: BlockKind;
  lines: string[];
};

export type BookPart = {
  index: number;
  slug: string;
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

export type BookSource = "docx" | "txt" | "empty";

export type Book = {
  meta: BookMeta;
  parts: BookPart[];
  source: BookSource;
};

const CONTENT_DIR = path.resolve(process.cwd(), "content");
const DOCX_PATH = path.join(CONTENT_DIR, "book.docx");
const TXT_PATH = path.join(CONTENT_DIR, "book.txt");
const META_PATH = path.join(CONTENT_DIR, "book.json");

const DEFAULT_META: BookMeta = {
  title: "Judul Buku",
  author: "Nama Penulis",
  tagline: "Sebuah booklet untuk dibaca pelan-pelan.",
  language: "id",
};

function readMeta(): BookMeta {
  if (!fs.existsSync(META_PATH)) return DEFAULT_META;
  try {
    const raw = JSON.parse(fs.readFileSync(META_PATH, "utf8")) as Partial<BookMeta>;
    return { ...DEFAULT_META, ...raw };
  } catch {
    return DEFAULT_META;
  }
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/** Two blank lines between content = new part */
function splitParts(text: string): string[] {
  return normalizeNewlines(text)
    .split(/\n[ \t]*\n[ \t]*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Single blank line = block boundary inside a part */
function splitBlocks(partText: string): string[] {
  return partText
    .split(/\n[ \t]*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function classifyBlock(text: string): BookBlock {
  const lines = text.split("\n").map((line) => line.trimEnd());
  const nonEmpty = lines.filter((line) => line.trim().length > 0);

  if (nonEmpty.length === 0) {
    return { kind: "prose", lines: [] };
  }

  const avgLen =
    nonEmpty.reduce((sum, line) => sum + line.trim().length, 0) / nonEmpty.length;
  const shortRatio =
    nonEmpty.filter((line) => line.trim().length > 0 && line.trim().length <= 42).length /
    nonEmpty.length;
  const multiLine = nonEmpty.length >= 2;

  // Short, broken lines → poetry; long flowing lines → prose
  const kind: BlockKind =
    multiLine && (avgLen <= 40 || shortRatio >= 0.65) ? "poetry" : "prose";

  return { kind, lines: nonEmpty };
}

function firstLineTitle(blocks: BookBlock[], index: number): string {
  const first = blocks[0]?.lines[0]?.trim();
  if (first && first.length <= 80) return first;
  return `Bagian ${index}`;
}

function previewFrom(blocks: BookBlock[]): string {
  const line = blocks.flatMap((b) => b.lines).find((l) => l.trim().length > 0);
  if (!line) return "";
  return line.length > 96 ? `${line.slice(0, 93)}…` : line;
}

function buildParts(rawText: string): BookPart[] {
  return splitParts(rawText).map((partText, i) => {
    const index = i + 1;
    const blocks = splitBlocks(partText).map(classifyBlock).filter((b) => b.lines.length > 0);
    return {
      index,
      slug: String(index),
      title: firstLineTitle(blocks, index),
      preview: previewFrom(blocks),
      blocks,
    };
  });
}

export async function loadBook(): Promise<Book> {
  const meta = readMeta();

  if (fs.existsSync(DOCX_PATH)) {
    const result = await mammoth.extractRawText({ path: DOCX_PATH });
    return { meta, parts: buildParts(result.value || ""), source: "docx" };
  }

  // Optional local fallback while waiting for the real .docx
  if (fs.existsSync(TXT_PATH)) {
    const text = fs.readFileSync(TXT_PATH, "utf8");
    return { meta, parts: buildParts(text), source: "txt" };
  }

  return { meta, parts: [], source: "empty" };
}

export function hasBookSource(): boolean {
  return fs.existsSync(DOCX_PATH) || fs.existsSync(TXT_PATH);
}
