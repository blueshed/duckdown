import type { Storage } from "./storage";
import { DEBUG } from "./config";
import { buildNav, parseFrontMatter, yes, sortFolders, folderOrder } from "./markdown";
import { escapeHtml, canonicalPath, dateHtml } from "./utils";
import { unlisted, pageKey, readable } from "./listed";
import { kept } from "./kept";
import { languagesOf, translation, treeOf } from "./languages";
import { joinKey } from "./slugs";

// What the site knows about itself: its nav, and each folder's list of pages,
// kept until a page changes (kept.ts).
//
// Each is the site's in a language: the default's when `lang` is empty (and
// then another language's folders are not in it), another's when it names one
// (see the language's tree, below). The nav and the sitemap are kept by
// language; a folder's listing by its language and its name, after a NUL, which
// no folder's name can hold.
const nav = kept(async (pages, lang, debug) =>
  lang ? languageNav(pages, lang) : buildNav(pages, "", (await languagesOf(pages, debug)).others));

const listings = kept((pages, key) => {
  const at = key.indexOf("\0");
  return at < 0 ? buildListing(pages, key, "") : buildListing(pages, key.slice(at + 1), key.slice(0, at));
});

export const siteNav = (pages: Storage, debug = DEBUG, lang = ""): Promise<string> => nav(pages, lang, debug);

// A folder's pages, for {{pages}} in its index.
export const folderListing = (pages: Storage, folder: string, debug = DEBUG, lang = ""): Promise<string> =>
  listings(pages, lang ? `${lang}\0${folder}` : folder, debug);

export type Listed = { key: string; href: string; title: string; date: string; description: string };

const byDateThenTitle = (a: Listed, b: Listed) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title);

// A folder's pages, newest first by date:, then by title: what listed.ts says
// is a page, less the folder's own index. The feed (feed.ts) is made from
// these too, so it and {{pages}} agree.
export async function folderEntries(pages: Storage, folder: string, lang = ""): Promise<Listed[]> {
  if (lang) return languageEntries(pages, folder, lang);
  const { files } = await pages.list(folder);
  const entries: Listed[] = [];

  for (const file of files) {
    if (!pageKey(file.path) || file.name === "index.md" || unlisted(file.name)) continue;
    const { meta } = parseFrontMatter(await pages.read(file.path));
    if (!readable(meta)) continue;
    entries.push({
      key: file.path,
      href: encodeURI(`/${file.path.replace(/\.md$/, ".html")}`),
      title: meta.title?.[0] ?? file.name.replace(/\.md$/, ""),
      date: meta.date?.[0] ?? "",
      description: meta.description?.[0] ?? "",
    });
  }
  return entries.sort(byDateThenTitle);
}

// A language's folder: its pages as that language's site has them, which is
// what answers at each address (languages.ts) — the page written in the
// language, else the default's standing in for it — and so what links there,
// and what is said of it. A translation says nothing of its date when the
// default's page already did: a date is the same in every language, and a
// listing in order must not lose it to a translator who copied only the words.
async function languageEntries(pages: Storage, folder: string, lang: string): Promise<Listed[]> {
  const entries: Listed[] = [];
  for (const name of (await treeOf(pages, lang, folder)).files) {
    const key = joinKey(folder, name);
    if (!pageKey(key) || name === "index.md") continue;
    const answer = await translation(pages, lang, key);
    if (!answer) continue;
    const { meta } = parseFrontMatter(await pages.read(answer.key));
    let date = meta.date?.[0];
    if (date === undefined && answer.kind === "translated" && await pages.exists(key)) {
      date = parseFrontMatter(await pages.read(key)).meta.date?.[0];
    }
    entries.push({
      key: answer.key,
      href: encodeURI(`/${lang}/${key.replace(/\.md$/, ".html")}`),
      title: meta.title?.[0] ?? name.replace(/\.md$/, ""),
      date: date ?? "",
      description: meta.description?.[0] ?? "",
    });
  }
  return entries.sort(byDateThenTitle);
}

// A language's folders in order: the order is the default's (it is the same in
// every language, and a translator is not asked to copy it), else the one the
// language's own folder says, for a folder only it has.
const languageOrder = (pages: Storage, lang: string) => async (folder: { path: string }) => {
  const own = await folderOrder(pages, folder.path);
  return own !== Infinity ? own : folderOrder(pages, `${lang}/${folder.path}`);
};

// A language's folders inside a folder (named in the default's tree), as the
// nav and the sitemap walk them.
async function languageFolders(pages: Storage, lang: string, folder: string) {
  const { folders } = await treeOf(pages, lang, folder);
  return sortFolders(pages, folders.map((name) => ({ name, path: joinKey(folder, name) })), languageOrder(pages, lang));
}

// The nav of a language: the same walk as the default's — an entry for each
// folder's index, folders in order — over what answers in the language, and
// pointing into its site (/cy/blog/). The page that answers decides the
// entry, label and all: a folder whose index isn't translated is there under
// the default's name, and a translator who gives one gives the language's.
async function languageNav(pages: Storage, lang: string, folder = ""): Promise<string> {
  const items: string[] = [];
  const key = joinKey(folder, "index.md");
  const answer = await translation(pages, lang, key);
  if (answer) {
    // translation() has left out a draft and an each: page already.
    const { meta } = parseFrontMatter(await pages.read(answer.key));
    const title = meta.nav?.[0] || meta.title?.[0];
    if (title) items.push(`<li><a href="${encodeURI(canonicalPath(`${lang}/${key}`))}">${escapeHtml(title)}</a></li>`);
  }
  for (const sub of await languageFolders(pages, lang, folder)) {
    const inside = await languageNav(pages, lang, sub.path);
    if (inside) items.push(inside);
  }
  return items.join("\n");
}

// The folder's pages, for {{pages}} in its index.
async function buildListing(pages: Storage, folder: string, lang: string): Promise<string> {
  const entries = await folderEntries(pages, folder, lang);
  if (!entries.length) return "";

  const items = entries.map((entry) => {
    const date = dateHtml(entry.date, lang);
    const description = entry.description ? `<p>${escapeHtml(entry.description)}</p>` : "";
    return `<li><a href="${entry.href}">${escapeHtml(entry.title)}</a>${date}${description}</li>`;
  });
  return `<ul class="pages">\n${items.join("\n")}\n</ul>`;
}

// The front matter of the page that answers for `key` in a language's site —
// in the default's, when `lang` is empty — or null when nothing does: no page,
// or a draft.
async function answering(pages: Storage, lang: string, key: string): Promise<Record<string, string[]> | null> {
  if (lang) {
    const answer = await translation(pages, lang, key);
    return answer ? parseFrontMatter(await pages.read(answer.key)).meta : null;
  }
  if (!await pages.exists(key)) return null;
  const { meta } = parseFrontMatter(await pages.read(key));
  return yes(meta.draft) ? null : meta;
}

// {{pages}} made recursive: every page, each folder under its index's title,
// in the order {{pages}} uses, and leaving out what it leaves out. `skip` is
// the default's top-level folders that aren't part of it: the languages'.
async function buildSiteMap(pages: Storage, folder: string, lang: string, skip: string[]): Promise<string> {
  const items: string[] = [];
  const at = (key: string) => joinKey(lang, key);   // where a page is in this site's own address
  // The site's front door is the first thing in the list; a folder's index is
  // the label of the folder, below.
  if (!folder) {
    const home = await answering(pages, lang, "index.md");
    if (home) items.push(`<li><a href="${canonicalPath(at("index.md"))}">${escapeHtml(home.title?.[0] ?? "Home")}</a></li>`);
  }

  for (const entry of await folderEntries(pages, folder, lang)) {
    items.push(`<li><a href="${entry.href}">${escapeHtml(entry.title)}</a></li>`);
  }
  // Follows the nav's own order, so the two agree on which folder comes first.
  const folders = lang
    ? await languageFolders(pages, lang, folder)
    : await sortFolders(pages, (await pages.list(folder)).folders.filter((f) => !unlisted(f.name) && !(folder === "" && skip.includes(f.name))));
  for (const sub of folders) {
    const path = sub.path;
    const inside = await buildSiteMap(pages, path, lang, skip);
    if (!inside) continue;
    const meta = await answering(pages, lang, `${path}/index.md`);
    const title = meta ? meta.title?.[0] ?? sub.name : "";
    const name = title ? `<a href="${encodeURI(canonicalPath(at(`${path}/index.md`)))}">${escapeHtml(title)}</a>` : escapeHtml(sub.name);
    items.push(`<li>${name}\n${inside}</li>`);
  }
  return items.length ? `<ul class="sitemap">\n${items.join("\n")}\n</ul>` : "";
}

const map = kept(async (pages, lang, debug) =>
  buildSiteMap(pages, "", lang, lang ? [] : (await languagesOf(pages, debug)).others));

// Every page, nested by folder, for {{sitemap}}. Kept like the nav.
export const siteMap = (pages: Storage, debug = DEBUG, lang = ""): Promise<string> => map(pages, lang, debug);

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
