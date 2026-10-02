import { createPageStorage, type Storage } from "./storage";
import { DEBUG } from "./config";
import { kept } from "./kept";
import { languagesOf, splitLanguage, keysUnder, sourceHash, stamped, translationRows, type Row } from "./languages";
import { collectionRows, stampItems, COLLECTION_FILE } from "./collection";
import { parseFrontMatter, folderOf } from "./markdown";
import { judge, SAYS, type Standing } from "./standing";

// Where every translation of the site stands — each page's, and each item of
// each collection's — for whoever is keeping them up to date: the export lists
// the ones that have fallen behind, and the editor marks them in its tree. A
// page is named in the default's tree ("about.md"); an item by its collection
// ("works/collection.json#first-light"). Kept like the nav, and dropped with it
// when a page changes (kept.ts).
const standings = kept(async (pages, _, debug) => [...await translationRows(pages, debug), ...await collectionRows(pages, debug)]);

export const translationStandings = (pages: Storage, debug = DEBUG): Promise<Row[]> => standings(pages, "", debug);

// `duckdown translations status [lang] [--json]` and `stamp <path>…`: what the
// editor's Translations drawer shows and does, for a site translated by script
// or checked from a terminal, so nothing has to import duckdown's modules by
// their paths. Through the storage layer like everything else, so it works on
// a folder and on a bucket. A page's key in a row is its key in the default's
// tree (about.md), whatever language it is a row of.
const USAGE = `duckdown translations status [lang] [--json]   where each translation stands
duckdown translations stamp <path>…                say translations were made from their originals as they are now
  a path is a translation (cy/about.md), a collection's words (cy/works/collection.json), or a folder
  of them (cy/guide, or cy for the lot)`;

export async function translationsCommand(args: string[], pages: Storage = createPageStorage(), say: (line: string) => void = console.log): Promise<number> {
  const [verb, ...rest] = args;
  if (verb === "status") return status(rest, pages, say);
  if (verb === "stamp" && rest.length) return stamp(rest, pages, say);
  throw new Error(`usage:\n${USAGE}`);
}

async function status(args: string[], pages: Storage, say: (line: string) => void): Promise<number> {
  const json = args.includes("--json");
  const [lang, ...extra] = args.filter((arg) => arg !== "--json");
  if (extra.length || lang?.startsWith("-")) throw new Error(`usage:\n${USAGE}`);
  const { others } = await languagesOf(pages, true);
  if (lang && !others.includes(lang)) {
    throw new Error(`${lang} isn't a language of this site${others.length ? ` (${others.join(", ")})` : ", which has one language"}`);
  }
  const rows = (await translationStandings(pages, true)).filter((row) => !lang || row.lang === lang);
  if (json) {
    say(JSON.stringify(rows, null, 2));
    return 0;
  }
  if (!others.length) {
    say("This site has one language.");
    return 0;
  }
  for (const code of lang ? [lang] : others) {
    const mine = rows.filter((row) => row.lang === code);
    const counts = (Object.keys(SAYS) as Standing[])
      .map((standing) => [standing, mine.filter((row) => row.standing === standing).length] as const)
      .filter(([, n]) => n);
    say(`${code}: ${counts.map(([standing, n]) => `${n} ${SAYS[standing]}`).join(", ") || "nothing to translate"}`);
    for (const row of [...mine].sort((a, b) => a.key.localeCompare(b.key))) {
      if (row.standing === "stale" || row.standing === "unchecked" || row.standing === "missing") {
        say(`  ${SAYS[row.standing].padEnd(SAYS.missing.length)}  ${code}/${row.key}${row.draft ? " (draft)" : ""}`);
      }
    }
  }
  return 0;
}

// What is stamped is what a person says they have checked: a translation that
// already says it is up to date is not touched, and one with nothing to have
// been made from (a page of the language's own) is left alone and said.
async function stamp(paths: string[], pages: Storage, say: (line: string) => void): Promise<number> {
  const languages = await languagesOf(pages, true);
  const stampedPages: string[] = [];
  let stampedItems = 0;
  const notes: string[] = [];

  for (const given of paths) {
    const path = given.replace(/^\/+|\/+$/g, "").replace(/^pages\//, "");
    const { lang } = splitLanguage(languages, path);
    if (lang === languages.main) {
      throw new Error(`${given} isn't in a language's folder (${languages.others.join(", ") || "this site has none"})`);
    }
    const named = path.endsWith(".md") || path.endsWith(COLLECTION_FILE);
    const found = named
      ? (await pages.exists(path) ? [path] : [])
      : [...await keysUnder(pages, path), ...await keysUnder(pages, path, [], (name) => name === COLLECTION_FILE)];
    if (!found.length) throw new Error(`${given}: there is nothing there to stamp`);
    for (const file of found) {
      if (file.endsWith(COLLECTION_FILE)) {
        const items = await stampItems(pages, folderOf(file.slice(lang.length + 1)), lang);
        if (items === null) notes.push(`${file}: no collection of the default's to be made from, or no words in ${lang} yet`);
        else stampedItems += items;
        continue;
      }
      const original = file.slice(lang.length + 1);
      const mine = await pages.read(file);
      const meta = parseFrontMatter(mine).meta;
      if (meta.each) continue;
      if (!await pages.exists(original)) {
        notes.push(`${file}: a page of ${lang}'s own, with no original to have been made from — left as it is`);
        continue;
      }
      const source = await pages.read(original);
      if (judge(meta["translated-from"]?.[0], sourceHash(source)) === "fresh") continue;
      await pages.write(file, stamped(mine, source));
      stampedPages.push(file);
    }
  }

  for (const file of stampedPages) say(`stamped ${file}`);
  for (const note of notes) say(`note: ${note}`);
  say(`stamped ${stampedPages.length} page(s) and ${stampedItems} item(s)`);
  if (stampedPages.length || stampedItems) say("A running server shows it after the next save in the editor, or when it restarts.");
  return 0;
}
