import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { buildNav, parseFrontMatter, yes } from "./markdown";
import { escapeHtml, canonicalPath, dateHtml } from "./utils";
import { NOT_FOUND } from "./search";

// What the site knows about itself: its nav, and each folder's list of pages.
// Both are built once and kept until a page changes — in production every
// write comes through this server (the pages route calls pagesChanged), so
// nothing else has to expire them. In development they are built per request
// instead: pages are often written straight to disk there, by hand or by an
// agent, and a cache would keep them out until the next save in the editor.
// A build that fails isn't kept either: the next request tries again.
let nav: Promise<string> | null = null;
const listings = new Map<string, Promise<string>>();

export function siteNav(pages: Storage, debug = DEBUG): Promise<string> {
  if (debug) return buildNav(pages);
  return (nav ??= buildNav(pages).catch((e) => {
    nav = null;
    throw e;
  }));
}

// A folder's pages, for {{pages}} in its index.
export function folderListing(pages: Storage, folder: string, debug = DEBUG): Promise<string> {
  if (debug) return buildListing(pages, folder);
  const kept = listings.get(folder);
  if (kept) return kept;
  const building = buildListing(pages, folder).catch((e) => {
    listings.delete(folder);
    throw e;
  });
  listings.set(folder, building);
  return building;
}

export function pagesChanged(): void {
  nav = null;
  map = null;
  listings.clear();
}

type Listed = { href: string; title: string; date: string; description: string };

// A folder's pages, newest first by date:, then by title. Its own index,
// drafts, the 404 page, and anything starting with - are left out.
async function folderEntries(pages: Storage, folder: string): Promise<Listed[]> {
  const { files } = await pages.list(folder);
  const entries: Listed[] = [];

  for (const file of files) {
    if (!file.name.endsWith(".md") || file.name === "index.md" || file.name.startsWith("-") || file.path.replace(/^\//, "") === NOT_FOUND) continue;
    const { meta } = parseFrontMatter(await pages.read(file.path.replace(/^\//, "")));
    if (yes(meta.draft)) continue;
    entries.push({
      href: encodeURI(`/${file.path.replace(/\.md$/, ".html").replace(/^\//, "")}`),
      title: meta.title?.[0] ?? file.name.replace(/\.md$/, ""),
      date: meta.date?.[0] ?? "",
      description: meta.description?.[0] ?? "",
    });
  }
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

// The folder's pages, for {{pages}} in its index.
async function buildListing(pages: Storage, folder: string): Promise<string> {
  const entries = await folderEntries(pages, folder);
  if (!entries.length) return "";

  const items = entries.map((entry) => {
    const date = dateHtml(entry.date);
    const description = entry.description ? `<p>${escapeHtml(entry.description)}</p>` : "";
    return `<li><a href="${entry.href}">${escapeHtml(entry.title)}</a>${date}${description}</li>`;
  });
  return `<ul class="pages">\n${items.join("\n")}\n</ul>`;
}

// {{pages}} made recursive: every page, each folder under its index's title,
// in the order {{pages}} uses, and leaving out what it leaves out.
async function buildSiteMap(pages: Storage, folder = ""): Promise<string> {
  const items: string[] = [];
  // The site's front door is the first thing in the list; a folder's index is
  // the label of the folder, below.
  if (!folder && await pages.exists("index.md")) {
    const { meta } = parseFrontMatter(await pages.read("index.md"));
    if (!yes(meta.draft)) items.push(`<li><a href="/">${escapeHtml(meta.title?.[0] ?? "Home")}</a></li>`);
  }

  for (const entry of await folderEntries(pages, folder)) {
    items.push(`<li><a href="${entry.href}">${escapeHtml(entry.title)}</a></li>`);
  }
  const { folders } = await pages.list(folder);
  for (const sub of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    if (sub.name.startsWith(".") || sub.name.startsWith("-")) continue;
    const path = sub.path.replace(/^\//, "");
    const inside = await buildSiteMap(pages, path);
    if (!inside) continue;
    const meta = await pages.exists(`${path}/index.md`) ? parseFrontMatter(await pages.read(`${path}/index.md`)).meta : null;
    const title = meta && !yes(meta.draft) ? meta.title?.[0] ?? sub.name : "";
    const name = title ? `<a href="${encodeURI(canonicalPath(`${path}/index.md`))}">${escapeHtml(title)}</a>` : escapeHtml(sub.name);
    items.push(`<li>${name}\n${inside}</li>`);
  }
  return items.length ? `<ul class="sitemap">\n${items.join("\n")}\n</ul>` : "";
}

let map: Promise<string> | null = null;

// Every page, nested by folder, for {{sitemap}}. Kept like the nav.
export function siteMap(pages: Storage, debug = DEBUG): Promise<string> {
  if (debug) return buildSiteMap(pages);
  return (map ??= buildSiteMap(pages).catch((e) => {
    map = null;
    throw e;
  }));
}

// The nav is one string for every page, so mark it per page: the page's own
// link gets aria-current="page"; failing that, the nearest folder it sits in
// gets aria-current="true" (not the root: every page sits there).
export function markCurrent(nav: string, file: string): string {
  const folders = file.split("/").slice(0, -1);
  // The same addresses the nav emits, or nothing would match.
  const candidates: [string, string][] = [[canonicalPath(`${file}.md`), "page"]];
  for (let i = folders.length; i > 0; i--) {
    candidates.push([canonicalPath(`${folders.slice(0, i).join("/")}/index.md`), "true"]);
  }
  for (const [path, current] of candidates) {
    const href = `href="${encodeURI(path)}"`;
    if (nav.includes(href)) return nav.replace(href, () => `${href} aria-current="${current}"`);
  }
  return nav;
}
