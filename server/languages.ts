import type { Storage } from "./storage";
import { parseFrontMatter, yes, addMeta, dropMeta } from "./markdown";
import { unlisted, hidden, readable, NOT_FOUND } from "./listed";
import { kept } from "./kept";
import { joinKey } from "./slugs";
import { judge, type Standing } from "./standing";

export type { Standing };

// A site in more than one language. Humans translate; duckdown never does, so
// everything here is about *which page answers* and *whether its translation
// still says what its source says* — never about the words.
//
// A language is a top-level folder named for its code (cy) whose index.md says
// `lang: cy`. pages/cy/about.md translates pages/about.md and is served at
// /cy/about.html; the root's own `lang` (en when it says nothing) is the
// default language, the one the unfoldered pages are in. A folder with no such
// index.md is a folder like any other, so a site that never says `lang:` has
// no languages and nothing here changes anything.

// The default language when the site's root index.md doesn't say.
export const DEFAULT = "en";

// A language as a folder is named: cy, fr, pt-br. Narrow on purpose, since the
// folder name becomes the first segment of every address in that language.
const CODE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/;

export type Languages = { main: string; others: string[] };

async function langOf(pages: Storage, key: string): Promise<string | undefined> {
  if (!await pages.exists(key)) return undefined;
  return parseFrontMatter(await pages.read(key)).meta.lang?.[0]?.toLowerCase();
}

// Another language is a folder that says so itself: `lang:` in its index.md
// equal to its name. A page elsewhere saying `lang: cy` is only that page's
// own language (a quotation, a Welsh-only notice) and starts no language, so
// an existing site's folders and pages can't become one by accident.
async function buildLanguages(pages: Storage): Promise<Languages> {
  const main = await langOf(pages, "index.md") ?? DEFAULT;
  const { folders } = await pages.list("");
  const others: string[] = [];
  for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
    if (unlisted(folder.name) || folder.name === main || !CODE.test(folder.name)) continue;
    if (await langOf(pages, `${folder.name}/index.md`) === folder.name) others.push(folder.name);
  }
  return { main, others };
}

const known = kept(buildLanguages);

// The site's languages, kept like the nav (kept.ts): it changes when a page does.
export const languagesOf = (pages: Storage, debug?: boolean): Promise<Languages> => known(pages, "", debug);

// Which language a page key is in, and where it sits in the default language's
// tree — the key its translations are named after: cy/blog/a-post.md is
// ("cy", "blog/a-post.md"), blog/a-post.md is (the default, itself). The
// language's own folder, cy, is ("cy", "").
export function splitLanguage(languages: Languages, key: string): { lang: string; key: string } {
  const other = languages.others.find((lang) => key === lang || key.startsWith(`${lang}/`));
  return other ? { lang: other, key: key.slice(other.length + 1) } : { lang: languages.main, key };
}

// A short fingerprint of some text: eight hex characters, enough to tell that
// what a translation was made from has changed.
export const shortHash = (text: string): string => new Bun.CryptoHasher("sha256").update(text).digest("hex").slice(0, 8);

// What a translator reads in a page: its title, its description, its words. A
// translation records this (`translated-from`) as it was when they wrote it, so
// a page that has changed since says so. What is left out — order, nav, draft,
// date, layout, css, aliases, image — is the same in every language and not
// something to retranslate. Line endings and trailing spaces don't count
// either: a save from another editor must not mark every page stale.
export function sourceHash(source: string): string {
  // Before it is parsed: a page with Windows line endings has no front matter
  // as far as the parser can tell, and would hash as one long body.
  const { meta, body } = parseFrontMatter(source.replace(/\r\n?/g, "\n"));
  const text = [meta.title?.[0] ?? "", meta.description?.[0] ?? "", body]
    .map((part) => part.replace(/[ \t]+$/gm, "").trim())
    .join("\n\0\n");
  return shortHash(text);
}

// A page as a reader gets it: not an each: page (it is its items), and not a
// draft — which is the editor's alone to see, so `drafts` is the signed-in one.
const shown = (meta: Record<string, string[]>, drafts: boolean) => drafts ? !meta.each : readable(meta);

// Whether the file is there and is a page as that reader gets it.
const showable = async (pages: Storage, key: string, drafts: boolean): Promise<boolean> =>
  await pages.exists(key) && shown(parseFrontMatter(await pages.read(key)).meta, drafts);

// Whether the language has a page of its own at `key` (named in the default's
// tree), for a reader — or, with `drafts`, for the editor: the question the
// fallback is the answer to when it is no.
export const translated = (pages: Storage, lang: string, key: string, drafts = false): Promise<boolean> =>
  showable(pages, `${lang}/${key}`, drafts);

// What answers at `lang`'s address for the page `key` (named in the default
// language's tree: "about.md", "blog/index.md"):
//
//   translated — the page written in that language, pages/<lang>/<key>;
//   fallback   — there is none (or it is a draft, to a reader), so the
//                default-language page answers, and says it is not yet
//                translated; the caller writes the note and the canonical
//                link, which point back at the page this names;
//   null       — nothing: not a language of this site, or neither page is
//                one a reader can have.
//
// A fallback is never a nearest match. It is the same page every time, found
// by the same name, and only where a translation could have been.
export type Translation = { kind: "translated" | "fallback"; key: string };

export async function translation(
  pages: Storage, lang: string, key: string, { drafts = false } = {},
): Promise<Translation | null> {
  if (!(await languagesOf(pages)).others.includes(lang)) return null;
  if (await translated(pages, lang, key, drafts)) return { kind: "translated", key: `${lang}/${key}` };
  return await showable(pages, key, drafts) ? { kind: "fallback", key } : null;
}

// The language an address is in, and what is left of it: "cy/about" is
// ("cy", "about"), "cy" is ("cy", ""). Null for an address in the default
// language, which is every address of a site with no others. `name` is the
// address as the site route reads it: no .html, no trailing slash.
export function languageAt(languages: Languages, name: string): { lang: string; rest: string } | null {
  const { lang, key } = splitLanguage(languages, name);
  return lang === languages.main ? null : { lang, rest: key };
}

// Every language that has something to show for a page, and what: the page
// itself in the language it is written in, a translation of it, or the
// default's standing in for one. Whatever language `key` is in, the answer is
// for the same page, in the default language's tree: this is what a language
// switcher and the hreflang links are made from. What a reader can have only,
// so a draft is never in it. The default language's own page counts as
// translated into itself. The page that answers a miss has none: it is not a
// page to be found in another language, but what each language says of a miss,
// and the reader is in the language of the address they asked for.
export type Counterpart = Translation & { lang: string };

export async function counterparts(pages: Storage, key: string): Promise<Counterpart[]> {
  const languages = await languagesOf(pages);
  const { key: source } = splitLanguage(languages, key);
  const found: Counterpart[] = [];
  if (source === NOT_FOUND) return found;
  const original = await showable(pages, source, false);
  if (original) found.push({ lang: languages.main, kind: "translated", key: source });
  for (const lang of languages.others) {
    if (await translated(pages, lang, source)) found.push({ lang, kind: "translated", key: `${lang}/${source}` });
    else if (original) found.push({ lang, kind: "fallback", key: source });
  }
  return found;
}

// What a reader is told when a page stands in for its translation, in that
// language's own words when its index.md gives them (`untranslated:`). With
// none given the line is English and says so (`lang`), since duckdown has no
// Welsh of its own to offer, and a reader should at least be told.
export const UNTRANSLATED = "This page has not been translated yet.";

export async function untranslatedNote(pages: Storage, lang: string): Promise<{ text: string; lang: string }> {
  const home = `${lang}/index.md`;
  const said = await pages.exists(home) ? parseFrontMatter(await pages.read(home)).meta.untranslated?.[0] : undefined;
  return said ? { text: said, lang } : { text: UNTRANSLATED, lang: "en" };
}

// A language by its own name — Cymraeg, English, français — which is how a
// reader looks for it, and which the platform knows, so there is no table here
// to keep. A code Intl can't name is shown as itself, and said once.
const autonyms = new Map<string, string>();

export function languageName(code: string): string {
  const had = autonyms.get(code);
  if (had) return had;
  let name: string;
  try {
    name = new Intl.DisplayNames([code], { type: "language" }).of(code) ?? code;
  } catch {
    console.error(`lang: "${code}" is not a language tag Intl knows — the switcher shows it as it is`);
    name = code;
  }
  autonyms.set(code, name);
  return name;
}

// What is in a folder of a language's site: the names of the pages and folders
// of the default tree there and of the tree written in the language, each name
// once. `folder` is named in the default's tree, and so is everything this
// gives back — a page's key is the same whichever language has it, and
// translation() says which answers. Unlisted and hidden names are left out
// (listed.ts), and at the top so are the folders that are languages: they are
// not part of any tree but their own.
export async function treeOf(pages: Storage, lang: string, folder: string): Promise<{ files: string[]; folders: string[] }> {
  const { others } = await languagesOf(pages);
  const here = await pages.list(folder);
  const there = await pages.list(joinKey(lang, folder));
  const names = (entries: { name: string }[]) => entries.map((e) => e.name).filter((name) => !unlisted(name));
  // The default's top is where the language folders sit; the language's own
  // top is a tree like any, and may have a folder of that name of its own.
  const ours = names(here.folders).filter((name) => folder !== "" || !others.includes(name));
  return {
    files: [...new Set([...names(here.files), ...names(there.files)])],
    folders: [...new Set([...ours, ...names(there.folders)])],
  };
}

// Every page of a language that wants attention, and where it stands — what the
// editor's tree marks and the export lists. A row is a page named in the default
// tree (`key`), for one language, and what that language has of it:
//
//   fresh      — translated, and it says it was made from the source as it is;
//   stale      — translated, and the source has changed since;
//   unchecked  — translated, with no record of what from;
//   own        — a page of the language's own, with nothing to translate;
//   missing    — not translated yet, so the default's stands in for it.
//
// `draft` is a translation being worked on: it isn't served, so it is not out
// of date to a reader. A default page nobody can read (a draft, an each: page)
// isn't missing anything, and an each: page is never translated by the page.
export type Row = { lang: string; key: string; standing: Standing; draft: boolean };

// The keys of the files under a folder that `wanted` takes, whole: the default's
// tree leaves out the folders that are languages (`skip`, at its top).
export async function keysUnder(
  pages: Storage, folder: string, skip: string[] = [], wanted: (name: string) => boolean = (name) => name.endsWith(".md"),
): Promise<string[]> {
  const { files, folders } = await pages.list(folder);
  const keys = files.filter((f) => wanted(f.name) && !hidden(f.name)).map((f) => f.path);
  for (const sub of folders.filter((f) => !hidden(f.name) && !skip.includes(f.name))) {
    keys.push(...await keysUnder(pages, sub.path, [], wanted));
  }
  return keys;
}

// Where every translation stands (rows above), found in one pass: each original
// is read once, however many languages translate it, and each translation once.
export async function translationRows(pages: Storage, debug?: boolean): Promise<Row[]> {
  const { others } = await languagesOf(pages, debug);
  if (!others.length) return [];
  const main = new Set(await keysUnder(pages, "", others));
  const originals = new Map<string, { each: boolean; shown: boolean; hash: string }>();
  const original = async (key: string) => {
    let found = originals.get(key);
    if (!found) {
      const source = await pages.read(key);
      const { meta } = parseFrontMatter(source);
      found = { each: !!meta.each, shown: shown(meta, false), hash: sourceHash(source) };
      originals.set(key, found);
    }
    return found;
  };
  const rows: Row[] = [];
  for (const lang of others) {
    const own = new Set((await keysUnder(pages, lang)).map((key) => key.slice(lang.length + 1)));
    for (const key of new Set([...main, ...own])) {
      const source = main.has(key) ? await original(key) : null;
      const mine = own.has(key) ? parseFrontMatter(await pages.read(`${lang}/${key}`)).meta : null;
      if (source?.each || mine?.each) continue;
      if (!mine) {
        if (source?.shown) rows.push({ lang, key, standing: "missing", draft: false });
        continue;
      }
      rows.push({ lang, key, standing: source ? judge(mine["translated-from"]?.[0], source.hash) : "own", draft: yes(mine.draft) });
    }
  }
  return rows;
}

// What a translation of a page starts as, for a translator to write over: the
// page itself, a draft until it is done (so a reader keeps the default's
// meanwhile), recording what it was made from. What belongs to the one page
// is left behind: the addresses it used to have (two pages claiming one
// address is a fault), its own `lang:`, and the words a language's home says
// of what isn't translated. A language's home says which language it is.
export function translationDraft(source: string, lang: string, key: string): string {
  let draft = source;
  for (const name of ["aliases", "lang", "draft", "translated-from", "untranslated"]) draft = dropMeta(draft, name, () => true);
  draft = addMeta(draft, "draft", "true");
  draft = addMeta(draft, "translated-from", sourceHash(source));
  return key === "index.md" ? addMeta(addMeta(draft, "lang", lang), "untranslated", "") : draft;
}

// A translation saying it was made from `source` as it is now: the translator
// has read what changed and has made theirs say the same.
export function stamped(translation: string, source: string): string {
  return addMeta(dropMeta(translation, "translated-from", () => true), "translated-from", sourceHash(source));
}

// Whether `lang` may be added as a language: a code, not the default's, not one
// the site has already.
export const newLanguage = (languages: Languages, lang: string) =>
  CODE.test(lang) && lang !== languages.main && !languages.others.includes(lang);
