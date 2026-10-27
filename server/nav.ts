import { readIfThere, type Storage } from "./storage";
import { DEBUG } from "./config";
import { parseFrontMatter, sortFolders, folderOrder } from "./markdown";
import { escapeHtml, canonicalPath, dateHtml, together } from "./utils";
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
  navOf(pages, lang, lang ? [] : (await languagesOf(pages, debug)).others));

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

// The page that answers for `key` in a language's site, the default's when
// `lang` is empty: the key it is read from, whether it is the language's own
// words, and its front matter. Null when nothing does: no page, or one no
// reader can have (listed.ts: a draft, an each: page), which translation()
// has left out already for a language.
type Answer = { key: string; kind: string; meta: Record<string, string[]> };

async function answering(pages: Storage, lang: string, key: string): Promise<Answer | null> {
  if (lang) {
    const answer = await translation(pages, lang, key);
    return answer ? { ...answer, meta: parseFrontMatter(await pages.read(answer.key)).meta } : null;
  }
  const source = await readIfThere(pages, key);
  if (source === null) return null;
  const { meta } = parseFrontMatter(source);
  return readable(meta) ? { key, kind: "translated", meta } : null;
}

// A language's folders in order: the order is the default's (it is the same in
// every language, and a translator is not asked to copy it), else the one the
// language's own folder says, for a folder only it has.
const languageOrder = (pages: Storage, lang: string) => async (folder: { path: string }) => {
  const own = await folderOrder(pages, folder.path);
  return own !== Infinity ? own : folderOrder(pages, `${lang}/${folder.path}`);
};

// The folders inside a folder, in the order the nav and the sitemap walk them.
// A language's are both trees' (languages.ts); the default's leave out `skip`
// at the top, the folders that are other languages.
async function foldersOf(pages: Storage, lang: string, folder: string, skip: string[]) {
  if (lang) {
    const { folders } = await treeOf(pages, lang, folder);
    return sortFolders(pages, folders.map((name) => ({ name, path: joinKey(folder, name) })), languageOrder(pages, lang));
  }
  const { folders } = await pages.list(folder);
  return sortFolders(pages, folders.filter((f) => !unlisted(f.name) && !(folder === "" && skip.includes(f.name))));
}

// The nav: an entry for each folder's index, folders in order, over what
// answers in the site, and pointing into it (/cy/blog/ in a language's). The
// page that answers decides the entry, label and all: a folder whose index
// isn't translated is there under the default's name.
async function navOf(pages: Storage, lang: string, skip: string[], folder = ""): Promise<string> {
  const items: string[] = [];
  const key = joinKey(folder, "index.md");
  const [index, folders] = await Promise.all([answering(pages, lang, key), foldersOf(pages, lang, folder, skip)]);
  const title = index && (index.meta.nav?.[0] || index.meta.title?.[0]);
  if (title) items.push(`<li><a href="${encodeURI(canonicalPath(joinKey(lang, key)))}">${escapeHtml(title)}</a></li>`);
  for (const inside of await together(folders, (sub) => navOf(pages, lang, skip, sub.path))) {
    if (inside) items.push(inside);
  }
  return items.join("\n");
}

// The default's nav, from a folder down; `skip` names top-level folders to
// leave out (the languages').
export const buildNav = (pages: Storage, prefix = "", skip: string[] = []): Promise<string> => navOf(pages, "", skip, prefix);

// A folder's pages, newest first by date:, then by title: what listed.ts says
// is a page, less the folder's own index. The feed (feed.ts) is made from
// these too, so it and {{pages}} agree. In a language's folder it is what
// answers at each address there, the language's page or the default's
// standing in, and a translation that says nothing of its date takes its
// original's: a date is the same in every language, and a listing in order
// must not lose it to a translator who copied only the words.
export async function folderEntries(pages: Storage, folder: string, lang = ""): Promise<Listed[]> {
  const names = lang
    ? (await treeOf(pages, lang, folder)).files
    : (await pages.list(folder)).files.map((f) => f.name).filter((name) => !unlisted(name));
  const listed = names.filter((name) => pageKey(joinKey(folder, name)) && name !== "index.md");
  const entries = await together(listed, async (name): Promise<Listed | null> => {
    const key = joinKey(folder, name);
    const answer = await answering(pages, lang, key);
    if (!answer) return null;
    const { meta } = answer;
    let date = meta.date?.[0];
    if (date === undefined && lang && answer.kind === "translated" && await pages.exists(key)) {
      date = parseFrontMatter(await pages.read(key)).meta.date?.[0];
    }
    return {
      key: answer.key,
      href: encodeURI(`/${joinKey(lang, key).replace(/\.md$/, ".html")}`),
      title: meta.title?.[0] ?? name.replace(/\.md$/, ""),
      date: date ?? "",
      description: meta.description?.[0] ?? "",
    };
  });
  return entries.filter((entry) => entry !== null).sort(byDateThenTitle);
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
    if (home) items.push(`<li><a href="${canonicalPath(at("index.md"))}">${escapeHtml(home.meta.title?.[0] ?? "Home")}</a></li>`);
  }

  const [entries, folders] = await Promise.all([folderEntries(pages, folder, lang), foldersOf(pages, lang, folder, skip)]);
  for (const entry of entries) {
    items.push(`<li><a href="${entry.href}">${escapeHtml(entry.title)}</a></li>`);
  }
  // Follows the nav's own order, so the two agree on which folder comes first.
  const subs = await together(folders, (sub) =>
    Promise.all([buildSiteMap(pages, sub.path, lang, skip), answering(pages, lang, `${sub.path}/index.md`)]));
  for (const [n, sub] of folders.entries()) {
    const path = sub.path;
    const [inside, index] = subs[n]!;
    if (!inside) continue;
    const title = index ? index.meta.title?.[0] ?? sub.name : "";
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
