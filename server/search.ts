import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { renderMarkdown, yes } from "./markdown";
import { canonicalPath } from "./utils";

// The site's own page for a miss: a page, but not one to search for, list or map.
export const NOT_FOUND = "404.md";

// What a reader can search: one entry per page and one per section of it, so a
// result can take the reader to the place and not just the page. Small enough
// to send whole — a few dozen pages is tens of kilobytes, less over the wire —
// so the browser does the matching and the server does no searching at all.
// Nothing here is a search engine.
export type Entry = {
  url: string;          // the page's address; a section's ends in #its-id
  title: string;        // the page's
  section: string;      // the heading, or "" for the page's own entry
  description: string;  // the page entry only
  date: string;
  text: string;         // this section's words
};

// A page a reader can reach, for whatever wants pages rather than sections
// (the sitemap).
export type PageRef = { url: string; date: string };

// What the browser is sent, and the pages it came from: one walk, both.
export type Built = { entries: Entry[]; pages: PageRef[] };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'" };

// Rendered HTML reduced to the words in it. Code blocks are punctuation that
// would swamp the index, and a contents list only repeats the headings.
function words(html: string): string {
  return html
    .replace(/<pre[\s\S]*?<\/pre>/g, " ")
    .replace(/<nav class="toc"[\s\S]*?<\/nav>/g, " ")
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|br|hr|tr|td|th|table|thead|tbody|blockquote|nav|section)\b[^>]*>/g, " ")   // a block ends a word
    .replace(/<[^>]+>/g, "")                                                                                      // an inline tag doesn't
    .replace(/&(?:amp|lt|gt|quot|#39|#x27);/g, (e) => ENTITIES[e]!)
    .replace(/\s+/g, " ")
    .trim();
}

// The rendered page cut at each heading. The ids are read out of the HTML the
// page is served with, never re-derived, so a link can't disagree with the
// page it points into. What comes before the first heading has no id.
function sections(html: string): { id: string; heading: string; body: string }[] {
  const found = [...html.matchAll(/<h[1-6] id="([^"]+)">([\s\S]*?)<\/h[1-6]>/g)];
  const cut = [{ id: "", heading: "", body: html.slice(0, found[0]?.index ?? html.length) }];
  found.forEach((m, i) => {
    const start = m.index + m[0].length;
    cut.push({ id: m[1]!, heading: words(m[2]!), body: html.slice(start, found[i + 1]?.index ?? html.length) });
  });
  return cut;
}

// Every page a reader could reach, in the order they were found. Drafts are
// left out — they are 404 to everyone but the editor, and a search result
// leading to a 404 is worse than no result — and so is the 404 page.
export async function buildSite(pages: Storage, prefix = ""): Promise<Built> {
  const { files, folders } = await pages.list(prefix);
  const out: Built = { entries: [], pages: [] };

  for (const f of files) {
    const key = f.path.replace(/^\//, "");
    if (!key.endsWith(".md") || key === NOT_FOUND) continue;
    const { content, meta } = renderMarkdown(await pages.read(key), key.replace(/\.md$/, ""));
    if (yes(meta.draft)) continue;
    const url = canonicalPath(key);
    const title = meta.title?.[0] ?? key.replace(/\.md$/, "");
    const date = meta.date?.[0] ?? "";
    out.pages.push({ url, date });
    for (const { id, heading, body } of sections(content)) {
      out.entries.push({
        url: id ? `${url}#${id}` : url,
        title,
        section: heading,
        description: id ? "" : meta.description?.[0] ?? "",
        date,
        text: words(body),
      });
    }
  }

  for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    if (folder.name.startsWith(".")) continue;
    const inside = await buildSite(pages, folder.path.replace(/^\//, ""));
    out.entries.push(...inside.entries);
    out.pages.push(...inside.pages);
  }

  return out;
}

// Kept until a page changes, like the nav and the folder listings, and rebuilt
// per request in development where pages are often written straight to disk.
let built: Promise<Built> | null = null;

function site(pages: Storage, debug: boolean): Promise<Built> {
  if (debug) return buildSite(pages);
  return (built ??= buildSite(pages).catch((e) => {
    built = null;
    throw e;
  }));
}

export const searchIndex = async (pages: Storage, debug = DEBUG): Promise<Entry[]> => (await site(pages, debug)).entries;
export const pageList = async (pages: Storage, debug = DEBUG): Promise<PageRef[]> => (await site(pages, debug)).pages;

export function searchChanged(): void {
  built = null;
}
