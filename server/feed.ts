import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { parseFrontMatter, renderMarkdown, yes } from "./markdown";
import { folderEntries } from "./nav";
import { canonicalPath, escapeHtml } from "./utils";

// A folder that says `feed: true` in its index.md can be followed in a feed
// reader: /<folder>/feed.xml, an Atom feed of the pages {{pages}} lists there,
// newest first. Only the dated ones — a feed is what's new, and Atom gives
// every entry a time; a page with no date: (or one nobody can read as a date)
// is listed on the folder's page and left out of its feed.
//
// Atom's ids and links are absolute, so the XML is written for an origin:
// the request's when served, DUCKDOWN_ORIGIN when exported. What it is made
// from is kept without one, like the nav, and dropped by feedsChanged()
// whenever the pages route writes.

type Entry = { url: string; title: string; updated: string; summary: string; content: string };
type Feed = { url: string; title: string; entries: Entry[] };

export const FEED_FILE = "feed.xml";

// A date: as Atom's time, or null. "2026-09-21" is that day at midnight, UTC.
function atomTime(date: string): string | null {
  const at = new Date(date);
  return date && !isNaN(at.getTime()) ? at.toISOString().replace(/\.\d{3}Z$/, "Z") : null;
}

async function buildFeed(pages: Storage, folder: string): Promise<Feed | null> {
  const index = `${folder ? `${folder}/` : ""}index.md`;
  if (!await pages.exists(index)) return null;
  const { meta } = parseFrontMatter(await pages.read(index));
  if (!yes(meta.feed) || yes(meta.draft)) return null;
  const entries: Entry[] = [];
  for (const listed of await folderEntries(pages, folder)) {
    const updated = atomTime(listed.date);
    if (!updated) continue;
    const { content } = renderMarkdown(await pages.read(listed.key), listed.key.replace(/\.md$/, ""));
    entries.push({ url: canonicalPath(listed.key), title: listed.title, updated, summary: listed.description, content });
  }
  return { url: canonicalPath(index), title: meta.title?.[0] ?? (folder || "Home"), entries };
}

const kept = new Map<string, Promise<Feed | null>>();

function feedOf(pages: Storage, folder: string, debug: boolean): Promise<Feed | null> {
  if (debug) return buildFeed(pages, folder);
  const had = kept.get(folder);
  if (had) return had;
  const building = buildFeed(pages, folder).catch((e) => {
    kept.delete(folder);
    throw e;
  });
  kept.set(folder, building);
  return building;
}

export function feedsChanged(): void {
  kept.clear();
}

// The folder's feed as Atom, or null when it doesn't have one. The author is
// the site's host: Atom asks for one, and a site is who writes it.
export async function feedXml(pages: Storage, folder: string, origin: string, debug = DEBUG): Promise<string | null> {
  const feed = await feedOf(pages, folder, debug);
  if (!feed) return null;
  const at = (url: string) => escapeHtml(origin + encodeURI(url));
  const self = at(`${feed.url}${FEED_FILE}`);
  const entries = feed.entries.map((e) => [
    "  <entry>",
    `    <id>${at(e.url)}</id>`,
    `    <title>${escapeHtml(e.title)}</title>`,
    `    <link rel="alternate" type="text/html" href="${at(e.url)}"/>`,
    `    <updated>${e.updated}</updated>`,
    ...(e.summary ? [`    <summary>${escapeHtml(e.summary)}</summary>`] : []),
    // Relative links in the page resolve against the page's own address.
    `    <content type="html" xml:base="${at(e.url)}">${escapeHtml(e.content)}</content>`,
    "  </entry>",
  ].join("\n"));
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom">`,
    `  <id>${self}</id>`,
    `  <title>${escapeHtml(feed.title)}</title>`,
    `  <link rel="self" type="application/atom+xml" href="${self}"/>`,
    `  <link rel="alternate" type="text/html" href="${at(feed.url)}"/>`,
    `  <updated>${feed.entries[0]?.updated ?? "1970-01-01T00:00:00Z"}</updated>`,
    `  <author><name>${escapeHtml(new URL(origin).host)}</name></author>`,
    ...entries,
    `</feed>`,
    "",
  ].join("\n");
}

// {{feed}}: where a reader's browser finds the feed of the folder a page is
// in, or nothing when that folder has none.
export async function feedLink(pages: Storage, folder: string, debug = DEBUG): Promise<string> {
  const feed = await feedOf(pages, folder, debug);
  if (!feed) return "";
  return `<link rel="alternate" type="application/atom+xml" title="${escapeHtml(feed.title)}" href="${escapeHtml(encodeURI(`${feed.url}${FEED_FILE}`))}">`;
}

// Whether `path` ("/blog/feed.xml", decoded) is a feed the site answers.
export async function isFeed(pages: Storage, path: string, debug = DEBUG): Promise<boolean> {
  if (path !== `/${FEED_FILE}` && !path.endsWith(`/${FEED_FILE}`)) return false;
  return (await feedOf(pages, feedFolder(path), debug)) !== null;
}

// The folder a feed's address names: "/blog/feed.xml" is blog, "/feed.xml" the root.
export const feedFolder = (path: string) => path.slice(1, -FEED_FILE.length).replace(/\/$/, "");
