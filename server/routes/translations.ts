import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { createPageStorage } from "../storage";
import { languagesOf, splitLanguage, translationDraft, stamped, newLanguage, type Languages } from "../languages";
import { translationStandings } from "../translations";
import { translationView } from "../collection";
import { parseFrontMatter } from "../markdown";
import { hidden } from "../listed";

const pages = createPageStorage();

// /edit/translations — what the editor needs to keep a site's languages
// together (languages.ts). What it only asks is GET:
//
//   GET                              the site's languages, and where each page
//                                    and item stands in each
//   GET ?draft=<lang>&key=<key>      what a translation of the page starts as
//   GET ?items=<lang>&folder=<dir>   a collection beside what the language says
//   POST ?stamp=<lang>&key=<key>     the body, saying it was made from the page
//                                    as it is now: "up to date"
//
// What it writes it hands back, to be saved through /edit/pages/ like anything
// the editor writes: that is what keeps the history, and drops what the site
// knows about itself.
const refused = (message: string, status = 400) => new Response(message, { status });

// A refusal for a language the site doesn't have, or nothing.
const unknownLanguage = (languages: Languages, lang: string) =>
  languages.others.includes(lang) ? null : refused(`${lang} isn't a language of this site`);

// A page of the default's tree the editor may translate: a page, found, and
// not what is a language's, or hidden, or one of the collection's each: pages.
async function source(key: string): Promise<string | Response> {
  const languages = await languagesOf(pages);
  if (!key.endsWith(".md") || key.split("/").some(hidden) || splitLanguage(languages, key).lang !== languages.main) {
    return refused(`${key} isn't a page of the default language to translate`);
  }
  if (!await pages.exists(key)) return refused(`There is no ${key}`, 404);
  const text = await pages.read(key);
  if (parseFrontMatter(text).meta.each) return refused(`${key} is the page each item of a collection gets: translate the items`);
  return text;
}

export const handleTranslations = {
  async GET(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const params = new URL(req.url).searchParams;
    const languages = await languagesOf(pages);

    if (params.has("draft")) {
      const lang = params.get("draft")!;
      const key = params.get("key") ?? "";
      // Another language is a folder that says so: the home page translated
      // into a code the site hasn't got is how one is added.
      const unknown = key === "index.md" && newLanguage(languages, lang) ? null : unknownLanguage(languages, lang);
      if (unknown) return unknown;
      const found = await source(key);
      if (found instanceof Response) return found;
      if (await pages.exists(`${lang}/${key}`)) return refused(`${lang}/${key} already exists`, 412);
      return new Response(translationDraft(found, lang, key), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (params.has("items")) {
      const lang = params.get("items")!;
      const unknown = unknownLanguage(languages, lang);
      if (unknown) return unknown;
      const view = await translationView(pages, params.get("folder") ?? "", lang);
      return view ? Response.json(view) : refused("There is no collection there to translate", 404);
    }

    return Response.json({ main: languages.main, others: languages.others, rows: await translationStandings(pages) });
  },

  async POST(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const params = new URL(req.url).searchParams;
    const lang = params.get("stamp");
    if (lang === null) return refused("Nothing to do", 404);
    const unknown = unknownLanguage(await languagesOf(pages), lang);
    if (unknown) return unknown;
    const found = await source(params.get("key") ?? "");
    if (found instanceof Response) return found;
    return new Response(stamped(await req.text(), found), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  },
};
