import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { renderMarkdown } from "./markdown";
import { COLLECTION_FILE, aliasKey, loadCollection, itemBody, itemMeta } from "./collection";
import { canonicalPath } from "./utils";
import { kept } from "./kept";
import { unlisted, pageKey, readable } from "./listed";
import { languagesOf } from "./languages";

// The site's own page for a miss: a page, but not one to search for, list or map.

// What a reader can search: one entry per page and one per section of it, so a
// result can take the reader to the place and not just the page. Small enough
// to fetch in parts (searchFiles() below) — what a reader downloads follows
// what they search, not the size of the site — so the browser does the
// matching and the server does no searching at all. Nothing here is a
// search engine.
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

// An address a page or an item used to answer at, and the one it answers at
// now: the served site turns the first into a 301 to the second, and the
// export writes a redirect page there. The key is already through aliasKey().
export type Alias = { from: string; to: string };

// What the browser is sent, the pages it came from, and the addresses that
// move: one walk, all three.
export type Built = { entries: Entry[]; pages: PageRef[]; aliases: Alias[] };

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
export async function buildSite(pages: Storage, prefix = "", debug = DEBUG, others?: string[]): Promise<Built> {
  others ??= (await languagesOf(pages, debug)).others;   // once, for the whole walk
  const { files, folders } = await pages.list(prefix);
  const out: Built = { entries: [], pages: [], aliases: [] };

  for (const f of files) {
    const key = f.path;
    if (!pageKey(key, others) || unlisted(f.name)) continue;
    const { content, meta } = renderMarkdown(await pages.read(key), key.replace(/\.md$/, ""));
    // An each: page is found by its collection, below, and is its items.
    if (!readable(meta)) continue;
    const url = canonicalPath(key);
    const title = meta.title?.[0] ?? key.replace(/\.md$/, "");
    const date = meta.date?.[0] ?? "";
    out.pages.push({ url, date });
    for (const alias of meta.aliases ?? []) out.aliases.push({ from: aliasKey(alias), to: url });
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

  // A folder's collection.json with an each: page beside it is a folder of
  // pages too: one entry per item, the words its page shows (its caption when
  // the page shows none), so a work is as findable as anything written by
  // hand — and its address is in the sitemap for the same reason.
  if (files.some((f) => f.name === COLLECTION_FILE)) {
    const collection = await loadCollection(pages, prefix, debug);
    // A language's search holds what is written in the language: an item with
    // no words of its own yet is the default's, shown there with a note.
    for (const item of (collection?.each ? collection.items : []).filter((item) => !item.untranslated)) {
      const context = { collection: collection!, item };
      const meta = itemMeta(context);
      out.pages.push({ url: item.href, date: "" });
      out.entries.push({
        url: item.href, title: meta.title![0]!, section: "", description: meta.description![0]!, date: "",
        text: words(itemBody(context)) || item.caption,
      });
      for (const alias of item.aliases) out.aliases.push({ from: aliasKey(alias), to: item.href });
    }
  }

  for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    if (unlisted(folder.name)) continue;
    const inside = await buildSite(pages, folder.path, debug, others);
    out.entries.push(...inside.entries);
    out.pages.push(...inside.pages);
    out.aliases.push(...inside.aliases);
  }

  return out;
}

// Kept until a page changes, like the nav and the folder listings (kept.ts).
const built = kept((pages, _, debug) => buildSite(pages, "", debug));
const site = (pages: Storage, debug: boolean): Promise<Built> => built(pages, "", debug);

// The walk takes in every language — one pass, and the sitemap and the
// addresses that move are the whole site's — but a reader searches in one:
// the default's entries are those outside the language folders, a language's
// are those under its own, so what a Welsh reader finds is Welsh.
export const entriesIn = (entries: Entry[], others: string[], lang: string): Entry[] =>
  entries.filter((e) => (others.find((other) => e.url.startsWith(`/${other}/`)) ?? "") === lang);

export async function searchIndex(pages: Storage, debug = DEBUG, lang = ""): Promise<Entry[]> {
  const { entries } = await site(pages, debug);
  return entriesIn(entries, (await languagesOf(pages, debug)).others, lang);
}
export const pageList = async (pages: Storage, debug = DEBUG): Promise<PageRef[]> => (await site(pages, debug)).pages;

// Every old address that moves, through aliasKey(): what a link may still say.
export const aliasTargets = async (pages: Storage, debug = DEBUG): Promise<string[]> =>
  (await site(pages, debug)).aliases.map((a) => a.from);

// Where an old address goes now, or null when it is simply a miss. Built from
// the same walk as the index, so it costs nothing extra and expires with it.
export async function aliasTarget(pages: Storage, path: string, debug = DEBUG): Promise<string | null> {
  const key = aliasKey(path);
  return (await site(pages, debug)).aliases.find((a) => a.from === key)?.to ?? null;
}

// ── The index in parts (n166) ──────────────────────────────────────────────
//
// Sent whole, the index is every word on the site: 68 MB at 20,000 pages, all
// of it fetched before a reader's first result. In parts, a search fetches the
// words it asks for and the pages it shows, and nothing else:
//
//   search/index.json        its version, and which shards there are:
//                            {"version": "…", "words": ["a", "ab", …]}
//   search/words/<xy>.json   every word starting xy, and where each one is
//   search/words/<x>.json    x*, every word starting x as one, and x, the word x itself
//   search/pages/<n>.json    page n's entries, just as the whole index has them
//
// The same files whether served or exported, so search.js can't tell the two
// apart, and it still does all the matching: nothing here searches.

// A word is a run of letters, marks, digits and _, and an apostrophe inside
// one (' or ’, read as ') is part of it: "Bunyan's" and "don't" are words.
// The words of a page are cut this way here and a query's the same way in
// search.js, so the one finds the other. It is where `\b` put a word's start,
// but for a letter after an apostrophe, and a letter outside a-z starts one too.
const WORD = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*/gu;
const wordsOf = (text: string): string[] => (text.toLowerCase().match(WORD) ?? []).map((w) => w.replace(/’/g, "'"));

// A word's shard is its first two letters, and the shard's file is that with
// anything but a-z and 0-9 spelt as its code point between dashes: "üb" is
// -fc-b.json (never a leading _, which Jekyll-based hosts refuse to publish; a
// dash can't be in a key, so it can only be an escape). A
// query of one letter matches every word starting with it, which would be
// every shard of that letter, so each letter has a shard of its own holding
// all of them at once as "x*" — where any word starting with it is, at its
// best — and a first keystroke fetches that alone. It holds "x", the word of
// that one letter, too: a letter cut from a longer word ("v-if") is only
// itself. search.js has the same two lines.
const shardOf = (word: string): string => [...word].slice(0, 2).join("");
const fileOf = (key: string): string => key.replace(/[^a-z0-9]/gu, (c) => `-${c.codePointAt(0)!.toString(16)}-`);

// Where in an entry a word is, at best — what search.js ranks by, and why a
// word in the title outranks the same word in a page's text.
const TITLE = 3, HEADING = 2, DESCRIPTION = 1, TEXT = 0;

export type SearchFiles = {
  index: string;                  // search/index.json
  words: Map<string, string>;     // a shard's file name → its JSON
  pages: Entry[][];               // each page's entries, its own first
};

// The whole index cut into its parts. A page is the entries in a row that
// share its address (its own, then one per section), numbered in the order
// the walk found them. A word's places are pairs of numbers: how many pages
// on from its last one, then section × 4 + where it is (TITLE … TEXT), once
// per section and at its best there — e.g. "train": [3, 6, 0, 8] is page 3's
// section 1 in a heading, then its section 2 in the text.
//
// A save can renumber the pages, so the index carries a version, made from
// everything in the parts: search.js asks for the index at each search and
// drops what it kept of another version.
export function searchFiles(entries: Entry[]): SearchFiles {
  const pages: Entry[][] = [];
  let at = "";
  for (const entry of entries) {
    const page = entry.url.split("#")[0]!;
    if (page === at) pages.at(-1)!.push(entry);
    else pages.push([entry]);
    at = page;
  }

  const shards = new Map<string, Map<string, number[]>>();
  const last = new Map<string, number>();   // a word's (or a letter's) last page, for the next one's gap
  const place = (key: string, word: string, n: number, section: number, where: number) => {
    if (!shards.has(key)) shards.set(key, new Map());
    const shard = shards.get(key)!;
    if (!shard.has(word)) shard.set(word, []);
    shard.get(word)!.push(n - (last.get(word) ?? 0), section * 4 + where);
    last.set(word, n);
  };
  pages.forEach((page, n) => {
    // A page's words are garbage once they are placed, and at 20,000 pages
    // they added up to more than the index kept before anything collected
    // them (n167): so it collects as it goes.
    if (n && n % 1000 === 0) Bun.gc(false);
    page.forEach((entry, section) => {
      const best = new Map<string, number>();
      for (const [where, field] of [[TITLE, entry.title], [HEADING, entry.section], [DESCRIPTION, entry.description], [TEXT, entry.text]] as const) {
        for (const word of wordsOf(field)) if (!best.has(word)) best.set(word, where);   // best first, so the first is the best
      }
      const letters = new Map<string, number>();
      for (const [word, where] of best) {
        const letter = [...word][0]!;
        letters.set(letter, Math.max(letters.get(letter) ?? TEXT, where));
        place(shardOf(word), word, n, section, where);   // a word of one letter in its letter's shard
      }
      for (const [letter, where] of letters) place(letter, `${letter}*`, n, section, where);
    });
  });

  const keys = [...shards.keys()].sort();
  const words = new Map(keys.map((key) => [fileOf(key), JSON.stringify(Object.fromEntries(shards.get(key)!))]));
  const version = new Bun.CryptoHasher("sha1");
  for (const body of words.values()) version.update(body);
  for (const page of pages) version.update(JSON.stringify(page));
  return { index: JSON.stringify({ version: version.digest("hex").slice(0, 12), words: keys }), words, pages };
}

// The file at `path` ("/search/words/tr.json"), or null when there is none.
// A page's is made when it is asked for: the whole index is already kept.
export function searchFile(files: SearchFiles, path: string): string | null {
  if (path === "/search/index.json") return files.index;
  const word = /^\/search\/words\/([a-z0-9-]+)\.json$/.exec(path);
  if (word) return files.words.get(word[1]!) ?? null;
  const page = /^\/search\/pages\/(0|[1-9]\d*)\.json$/.exec(path);   // one name a page: not 00.json
  const entries = page ? files.pages[Number(page[1])] : undefined;
  return entries ? JSON.stringify(entries) : null;
}

// Every file, as [path under dist/, body], one at a time: the export writes
// each as it comes rather than holding them all.
export function* searchFileList(files: SearchFiles): Generator<[string, string]> {
  yield ["search/index.json", files.index];
  for (const [file, body] of files.words) yield [`search/words/${file}.json`, body];
  for (let n = 0; n < files.pages.length; n++) yield [`search/pages/${n}.json`, JSON.stringify(files.pages[n])];
}

// Kept with the index they are cut from, and dropped with it: one set per
// language, named by it ("" for the default's).
const parts = kept(async (pages, lang, debug) => searchFiles(await searchIndex(pages, debug, lang)));
export const searchParts = (pages: Storage, debug = DEBUG, lang = ""): Promise<SearchFiles> => parts(pages, lang, debug);

