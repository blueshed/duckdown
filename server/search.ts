import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { parseFrontMatter, yes } from "./markdown";
import { canonicalPath } from "./utils";

// What a reader can search: one entry per page, with enough of its words to
// find it by. Small enough to send whole — a few dozen pages is tens of
// kilobytes, less over the wire — so the browser does the matching and the
// server does no searching at all. Nothing here is a search engine.
export type Entry = {
  url: string;
  title: string;
  description: string;
  text: string;
};

// Markdown reduced to the words in it. Not a renderer: a heading's `##`, a
// link's brackets and a fence's contents are all noise to someone looking for
// a phrase, and code blocks are mostly punctuation that would swamp the index.
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")            // fenced code
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/<[^>]+>/g, " ")                   // raw html
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")      // images, alt and all
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")    // links keep their label
    .replace(/`([^`]*)`/g, "$1")                // inline code
    .replace(/^\s*>\s?\[![A-Z]+\]\s*$/gim, " ") // callout markers
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")         // heading marks
    .replace(/^\s{0,3}>\s?/gm, "")              // quote marks
    .replace(/^\s{0,3}[-*+]\s+/gm, "")          // bullets
    .replace(/^\s{0,3}\|.*$/gm, " ")            // tables: mostly pipes
    .replace(/[*_~]/g, "")                      // emphasis
    .replace(/\s+/g, " ")
    .trim();
}

// Every page a reader could reach, in the order they were found. Drafts are
// left out — they are 404 to everyone but the editor, and a search result
// leading to a 404 is worse than no result.
export async function buildIndex(pages: Storage, prefix = ""): Promise<Entry[]> {
  const { files, folders } = await pages.list(prefix);
  const out: Entry[] = [];

  for (const f of files) {
    const key = f.path.replace(/^\//, "");
    if (!key.endsWith(".md")) continue;
    const { meta, body } = parseFrontMatter(await pages.read(key));
    if (yes(meta.draft)) continue;
    out.push({
      url: canonicalPath(key),
      title: meta.title?.[0] ?? key.replace(/\.md$/, ""),
      description: meta.description?.[0] ?? "",
      text: plainText(body),
    });
  }

  for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    if (folder.name.startsWith(".")) continue;
    out.push(...await buildIndex(pages, folder.path.replace(/^\//, "")));
  }

  return out;
}

// Kept until a page changes, like the nav and the folder listings, and rebuilt
// per request in development where pages are often written straight to disk.
let index: Promise<Entry[]> | null = null;

export function searchIndex(pages: Storage, debug = DEBUG): Promise<Entry[]> {
  if (debug) return buildIndex(pages);
  return (index ??= buildIndex(pages).catch((e) => {
    index = null;
    throw e;
  }));
}

export function searchChanged(): void {
  index = null;
}
