import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { buildNav, parseFrontMatter, yes } from "./markdown";
import { escapeHtml, canonicalPath, dateHtml } from "./utils";

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
  listings.clear();
}

// The folder's pages, newest first by date:, then by title. Its own index,
// drafts, and anything starting with - are left out.
async function buildListing(pages: Storage, folder: string): Promise<string> {
  const { files } = await pages.list(folder);
  const entries: { href: string; title: string; date: string; description: string }[] = [];

  for (const file of files) {
    if (!file.name.endsWith(".md") || file.name === "index.md" || file.name.startsWith("-")) continue;
    const { meta } = parseFrontMatter(await pages.read(file.path.replace(/^\//, "")));
    if (yes(meta.draft)) continue;
    entries.push({
      href: encodeURI(`/${file.path.replace(/\.md$/, ".html").replace(/^\//, "")}`),
      title: meta.title?.[0] ?? file.name.replace(/\.md$/, ""),
      date: meta.date?.[0] ?? "",
      description: meta.description?.[0] ?? "",
    });
  }
  if (!entries.length) return "";
  entries.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

  const items = entries.map((entry) => {
    const date = dateHtml(entry.date);
    const description = entry.description ? `<p>${escapeHtml(entry.description)}</p>` : "";
    return `<li><a href="${entry.href}">${escapeHtml(entry.title)}</a>${date}${description}</li>`;
  });
  return `<ul class="pages">\n${items.join("\n")}\n</ul>`;
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
