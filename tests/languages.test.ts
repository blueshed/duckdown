// A site in more than one language: which folders are languages, which page
// answers at a language's address, and whether a translation still says what
// its source says.
import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import type { Storage, Listing } from "../server/storage";
import { parseFrontMatter } from "../server/markdown";
import { siteChanged } from "../server/kept";
import {
  DEFAULT, UNTRANSLATED, languagesOf, languageAt, splitLanguage, sourceHash, translation, standing,
  counterparts, untranslatedNote, languageName, translationRows, translationDraft, stamped, newLanguage, type Counterpart, type Row,
} from "../server/languages";

// An in-memory Storage over { "cy/index.md": "…" }.
function memory(files: Record<string, string>): Storage {
  return {
    async list(prefix) {
      const dir = prefix ? `${prefix}/` : "";
      const out: Listing = { files: [], folders: [] };
      for (const key of Object.keys(files).filter((k) => k.startsWith(dir))) {
        const rest = key.slice(dir.length);
        const name = rest.split("/")[0]!;
        if (rest === name) out.files.push({ name, path: key, file: true, size: 0, type: "text/markdown" });
        else if (!out.folders.some((f) => f.name === name)) out.folders.push({ name, path: `${dir}${name}`, file: false });
      }
      return out;
    },
    async read(key) { return files[key]!; },
    async readBytes(key) { return new TextEncoder().encode(files[key]); },
    async write(key, body) { files[key] = String(body); },
    async remove(key) { delete files[key]; },
    async exists(key) { return key in files; },
    mime: () => "text/markdown",
  };
}

// What the site knows about its languages is kept until a page changes, and
// the cache is the site's, not a storage's: each test starts it again.
beforeEach(() => siteChanged());

const WELSH = { "index.md": "title: Home\n\nHello", "cy/index.md": "lang: cy\ntitle: Hafan\nuntranslated: Nid yw wedi'i chyfieithu eto." };

describe("the front matter", () => {
  test("lang, translated-from and untranslated are keys a bare block may use", () => {
    const { meta, body } = parseFrontMatter("lang: cy\ntranslated-from: 1a2b3c4d\nuntranslated: Nid eto\n\nHelo");
    expect(meta.lang).toEqual(["cy"]);
    expect(meta["translated-from"]).toEqual(["1a2b3c4d"]);
    expect(meta.untranslated).toEqual(["Nid eto"]);
    expect(body).toBe("Helo");
  });
});

describe("languagesOf", () => {
  test("a site that never says lang: has one language and no others", async () => {
    const pages = memory({ "index.md": "title: Home\n\nHi", "about.md": "About", "cy/about.md": "Amdanom" });
    expect(await languagesOf(pages)).toEqual({ main: DEFAULT, others: [] });
  });

  test("a folder that says lang: its own name is a language", async () => {
    expect(await languagesOf(memory(WELSH))).toEqual({ main: "en", others: ["cy"] });
  });

  test("the default language is the root's own lang:, and it is not also another", async () => {
    const pages = memory({ "index.md": "lang: cy\n\nHelo", "cy/index.md": "lang: cy\n\nHelo", "en/index.md": "lang: en\n\nHi" });
    expect(await languagesOf(pages)).toEqual({ main: "cy", others: ["en"] });
  });

  test("a folder saying lang: another name is not a language, only its home page's own", async () => {
    const pages = memory({ "news/index.md": "lang: cy\n\nNewyddion", "news/a.md": "Un" });
    expect((await languagesOf(pages)).others).toEqual([]);
  });

  test("a folder with no index.md, an unlisted one and a name no code has are left alone", async () => {
    const pages = memory({
      "cy/about.md": "lang: cy\n\nx",                 // no index.md says it
      "-fr/index.md": "lang: -fr\n\nx",              // unlisted
      "Welsh/index.md": "lang: welsh\n\nx",          // not a code
      "pt-br/index.md": "lang: pt-BR\n\nx",          // a code, said in capitals: still its own name
      "de/index.md": "title: Neu\n\nx",              // says no lang
    });
    expect((await languagesOf(pages)).others).toEqual(["pt-br"]);
  });

  test("others come in name order", async () => {
    const pages = memory({ "fr/index.md": "lang: fr\n\nx", "cy/index.md": "lang: cy\n\nx" });
    expect((await languagesOf(pages)).others).toEqual(["cy", "fr"]);
  });

  test("it is kept until the site changes", async () => {
    const files: Record<string, string> = { "index.md": "Hi" };
    const pages = memory(files);
    expect((await languagesOf(pages)).others).toEqual([]);
    files["cy/index.md"] = "lang: cy\n\nx";
    expect((await languagesOf(pages)).others).toEqual([]);   // still what it was
    siteChanged();
    expect((await languagesOf(pages)).others).toEqual(["cy"]);
  });
});

describe("splitLanguage", () => {
  const languages = { main: "en", others: ["cy"] };

  test("a key under a language's folder is that language's, named in the default tree", () => {
    expect(splitLanguage(languages, "cy/blog/a-post.md")).toEqual({ lang: "cy", key: "blog/a-post.md" });
    expect(splitLanguage(languages, "cy/index.md")).toEqual({ lang: "cy", key: "index.md" });
  });

  test("any other key is the default language's, as it is", () => {
    expect(splitLanguage(languages, "blog/a-post.md")).toEqual({ lang: "en", key: "blog/a-post.md" });
    expect(splitLanguage(languages, "cymru/a.md")).toEqual({ lang: "en", key: "cymru/a.md" });   // a prefix is not a folder
    expect(splitLanguage(languages, "cy.md")).toEqual({ lang: "en", key: "cy.md" });
  });
});

describe("sourceHash", () => {
  const page = "title: About\ndescription: Who we are\n\nWe make things.\n\nSlowly.";

  test("eight hex characters", () => {
    expect(sourceHash(page)).toMatch(/^[0-9a-f]{8}$/);
  });

  test("what a translator reads changes it: the title, the description, the words", () => {
    const was = sourceHash(page);
    expect(sourceHash(page.replace("About", "About us"))).not.toBe(was);
    expect(sourceHash(page.replace("Who we are", "Who"))).not.toBe(was);
    expect(sourceHash(page.replace("Slowly", "Carefully"))).not.toBe(was);
  });

  test("what is the same in every language doesn't", () => {
    const was = sourceHash(page);
    const withMore = "title: About\ndescription: Who we are\norder: 3\nnav: Us\ndraft: true\ndate: 2026-10-02\nlayout: post\ncss: poster\naliases: /old\nimage: a.jpg\nx-colour: red\n\nWe make things.\n\nSlowly.";
    expect(sourceHash(withMore)).toBe(was);
  });

  test("a fence around the same block, line endings and trailing spaces don't change it", () => {
    const was = sourceHash(page);
    expect(sourceHash(`---\n${page.replace("\n\n", "\n---\n\n")}`)).toBe(was);
    expect(sourceHash(page.replace(/\n/g, "\r\n"))).toBe(was);
    expect(sourceHash(page.replace("Slowly.", "Slowly.   \n\n"))).toBe(was);
    expect(sourceHash(page.replace("We make things.", "We make things.  \t"))).toBe(was);
  });

  test("a title moved into the words is not the same page", () => {
    // The parts are kept apart: "a" + "bc" is not "ab" + "c".
    expect(sourceHash("title: a\n\nbc")).not.toBe(sourceHash("title: ab\n\nc"));
  });

  test("a page with no front matter is only its words", () => {
    expect(sourceHash("Just words")).toBe(sourceHash("\nJust words\n"));
  });
});

describe("translation", () => {
  const files = () => ({
    ...WELSH,
    "about.md": "title: About\n\nUs",
    "cy/about.md": "title: Amdanom\n\nNi",
    "contact.md": "title: Contact\n\nWrite",
    "blog/index.md": "title: Blog\n\nPosts",
    "cy/blog/index.md": "title: Blog\n\nPostiadau",
  });

  test("a page written in the language answers for itself", async () => {
    const pages = memory(files());
    expect(await translation(pages, "cy", "about.md")).toEqual({ kind: "translated", key: "cy/about.md" });
    expect(await translation(pages, "cy", "blog/index.md")).toEqual({ kind: "translated", key: "cy/blog/index.md" });
    expect(await translation(pages, "cy", "index.md")).toEqual({ kind: "translated", key: "cy/index.md" });
  });

  test("a page not yet translated falls back to the default language's, by the same name", async () => {
    const pages = memory(files());
    expect(await translation(pages, "cy", "contact.md")).toEqual({ kind: "fallback", key: "contact.md" });
  });

  test("a draft translation is the editor's: a reader still gets the fallback", async () => {
    const all = { ...files(), "cy/contact.md": "draft: true\n\nCysylltu" };
    const pages = memory(all);
    expect(await translation(pages, "cy", "contact.md")).toEqual({ kind: "fallback", key: "contact.md" });
    expect(await translation(pages, "cy", "contact.md", { drafts: true })).toEqual({ kind: "translated", key: "cy/contact.md" });
  });

  test("an each: page is its items, not a page: there is nothing to answer with", async () => {
    const pages = memory({ ...WELSH, "works/item.md": "each: true\n\nx", "cy/works/item.md": "each: true\n\ny" });
    expect(await translation(pages, "cy", "works/item.md")).toBeNull();
    expect(await translation(pages, "cy", "works/item.md", { drafts: true })).toBeNull();
  });

  test("a draft source has no fallback for a reader, and has one for the editor", async () => {
    const pages = memory({ ...WELSH, "soon.md": "draft: true\n\nLater" });
    expect(await translation(pages, "cy", "soon.md")).toBeNull();
    expect(await translation(pages, "cy", "soon.md", { drafts: true })).toEqual({ kind: "fallback", key: "soon.md" });
  });

  test("a translation with no source is a page of the language's own", async () => {
    const pages = memory({ ...WELSH, "cy/lleol.md": "title: Lleol\n\nYma" });
    expect(await translation(pages, "cy", "lleol.md")).toEqual({ kind: "translated", key: "cy/lleol.md" });
  });

  test("a page neither language has is nothing, never a nearest match", async () => {
    const pages = memory(files());
    expect(await translation(pages, "cy", "nowhere.md")).toBeNull();
  });

  test("only a language of the site answers: not the default, not a folder, not a name nobody gave", async () => {
    const pages = memory({ ...files(), "zz/about.md": "title: Zed\n\nz" });
    expect(await translation(pages, "en", "about.md")).toBeNull();
    expect(await translation(pages, "zz", "about.md")).toBeNull();
    expect(await translation(pages, "fr", "about.md")).toBeNull();
    expect(await translation(pages, "blog", "index.md")).toBeNull();
  });
});

describe("standing", () => {
  const source = "title: About\n\nUs";
  const stamped = (hash: string) => `translated-from: ${hash}\n\nNi`;

  test("a translation made from the source as it is is fresh", async () => {
    const pages = memory({ ...WELSH, "about.md": source, "cy/about.md": stamped(sourceHash(source)) });
    expect(await standing(pages, "cy", "about.md")).toBe("fresh");
  });

  test("the hash is read however it is written", async () => {
    const pages = memory({ ...WELSH, "about.md": source, "cy/about.md": stamped(sourceHash(source).toUpperCase()) });
    expect(await standing(pages, "cy", "about.md")).toBe("fresh");
  });

  test("a source that has changed since leaves the translation stale", async () => {
    const files: Record<string, string> = { ...WELSH, "about.md": source, "cy/about.md": stamped(sourceHash(source)) };
    const pages = memory(files);
    files["about.md"] = "title: About\n\nUs, and more";
    expect(await standing(pages, "cy", "about.md")).toBe("stale");
  });

  test("a change to what every language shares leaves it fresh", async () => {
    const files: Record<string, string> = { ...WELSH, "about.md": source, "cy/about.md": stamped(sourceHash(source)) };
    const pages = memory(files);
    files["about.md"] = "title: About\norder: 2\ndraft: true\n\nUs";
    expect(await standing(pages, "cy", "about.md")).toBe("fresh");
  });

  test("a translation that doesn't say what it came from is unchecked", async () => {
    const pages = memory({ ...WELSH, "about.md": source, "cy/about.md": "title: Amdanom\n\nNi" });
    expect(await standing(pages, "cy", "about.md")).toBe("unchecked");
  });

  test("a translation with no source is the language's own", async () => {
    const pages = memory({ ...WELSH, "cy/lleol.md": "title: Lleol\n\nYma" });
    expect(await standing(pages, "cy", "lleol.md")).toBe("own");
  });

  test("no translation is missing", async () => {
    const pages = memory({ ...WELSH, "about.md": source });
    expect(await standing(pages, "cy", "about.md")).toBe("missing");
  });

  test("a draft translation stands like any other: it is the one being worked on", async () => {
    const pages = memory({ ...WELSH, "about.md": source, "cy/about.md": `draft: true\ntranslated-from: ${sourceHash(source)}\n\nNi` });
    expect(await standing(pages, "cy", "about.md")).toBe("fresh");
  });
});

describe("languageAt", () => {
  const languages = { main: "en", others: ["cy", "pt-br"] };

  test("an address under a language's folder is in it, and what is left is the page's", () => {
    expect(languageAt(languages, "cy/about")).toEqual({ lang: "cy", rest: "about" });
    expect(languageAt(languages, "cy/blog/index")).toEqual({ lang: "cy", rest: "blog/index" });
    expect(languageAt(languages, "pt-br/about")).toEqual({ lang: "pt-br", rest: "about" });
  });

  test("the language's own address is its home", () => {
    expect(languageAt(languages, "cy")).toEqual({ lang: "cy", rest: "" });
  });

  test("any other address is the default's, and so is every address of a site with no others", () => {
    expect(languageAt(languages, "about")).toBeNull();
    expect(languageAt(languages, "cymru/about")).toBeNull();   // a prefix is not a folder
    expect(languageAt(languages, "index")).toBeNull();
    expect(languageAt({ main: "en", others: [] }, "cy/about")).toBeNull();
  });
});

describe("counterparts", () => {
  const files = () => ({
    ...WELSH,
    "fr/index.md": "lang: fr\n\nBonjour",
    "about.md": "title: About\n\nUs",
    "cy/about.md": "title: Amdanom\n\nNi",
    "contact.md": "title: Contact\n\nWrite",
    "cy/lleol.md": "title: Lleol\n\nYma",
    "soon.md": "draft: true\n\nLater",
  });

  test("every language that has the page, each as it has it, whichever language the key is in", async () => {
    const pages = memory({ ...files(), "fr/about.md": "title: À propos\n\nNous" });
    const all: Counterpart[] = [
      { lang: "en", kind: "translated", key: "about.md" },
      { lang: "cy", kind: "translated", key: "cy/about.md" },
      { lang: "fr", kind: "translated", key: "fr/about.md" },
    ];
    expect(await counterparts(pages, "about.md")).toEqual(all);
    expect(await counterparts(pages, "cy/about.md")).toEqual(all);
    expect(await counterparts(pages, "fr/about.md")).toEqual(all);
  });

  test("a language without the page has the default's standing in for it", async () => {
    const pages = memory(files());
    expect(await counterparts(pages, "contact.md")).toEqual([
      { lang: "en", kind: "translated", key: "contact.md" },
      { lang: "cy", kind: "fallback", key: "contact.md" },
      { lang: "fr", kind: "fallback", key: "contact.md" },
    ]);
  });

  test("a page of one language's own is in that language alone", async () => {
    expect(await counterparts(memory(files()), "cy/lleol.md")).toEqual([{ lang: "cy", kind: "translated", key: "cy/lleol.md" }]);
  });

  test("a draft is in none of them: a reader has no page there", async () => {
    expect(await counterparts(memory(files()), "soon.md")).toEqual([]);
  });

  test("the page that answers a miss is in no language but the one it is shown in", async () => {
    const pages = memory({ ...files(), "404.md": "title: Gone\n\nx", "cy/404.md": "title: Wedi mynd\n\nx" });
    expect(await counterparts(pages, "404.md")).toEqual([]);
    expect(await counterparts(pages, "cy/404.md")).toEqual([]);
  });

  test("a site with no other language has only the page itself", async () => {
    expect(await counterparts(memory({ "about.md": "About" }), "about.md")).toEqual([{ lang: "en", kind: "translated", key: "about.md" }]);
  });
});

describe("untranslatedNote", () => {
  test("is the language's own words when its index.md gives them, marked as the language's", async () => {
    expect(await untranslatedNote(memory(WELSH), "cy")).toEqual({ text: "Nid yw wedi'i chyfieithu eto.", lang: "cy" });
  });

  test("is English, and says so, when it gives none", async () => {
    expect(await untranslatedNote(memory({ "index.md": "Hi", "cy/index.md": "lang: cy\n\nx" }), "cy")).toEqual({ text: UNTRANSLATED, lang: "en" });
    expect(await untranslatedNote(memory({ "index.md": "Hi" }), "cy")).toEqual({ text: UNTRANSLATED, lang: "en" });
  });
});

describe("languageName", () => {
  test("a language is named in its own", () => {
    expect(languageName("cy")).toBe("Cymraeg");
    expect(languageName("en")).toBe("English");
    expect(languageName("fr")).toBe("français");
  });

  test("a code Intl can't read is shown as it is, and said once", () => {
    const said = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(languageName("aa-x1")).toBe("aa-x1");
      expect(languageName("aa-x1")).toBe("aa-x1");
      expect(said).toHaveBeenCalledTimes(1);
      expect(said.mock.calls[0]![0]).toContain("aa-x1");
    } finally {
      said.mockRestore();
    }
  });
});

describe("translationRows", () => {
  const home = sourceHash("title: About\n\nUs");
  const SITE = {
    ...WELSH,
    "fr/index.md": "lang: fr\n\nBonjour",
    "about.md": "title: About\n\nUs",
    "cy/about.md": `translated-from: ${home}\n\nNi`,                         // fresh
    "fr/about.md": "translated-from: 00000000\n\nNous",                      // stale
    "contact.md": "title: Contact\n\nWrite",
    "cy/contact.md": "title: Cysylltu\n\nYsgrifennwch",                      // unchecked
    "blog/index.md": "title: Blog\n\nPosts",
    "blog/post.md": "title: Post\n\nA post",                                 // missing from both
    "cy/blog/lleol.md": "title: Lleol\n\nDim ond yma",                       // cy's own
    "soon.md": "draft: true\n\nLater",                                       // a draft source: nothing missing
    "works/item.md": "each: true\n\nx",                                      // an each: page: never translated by the page
    "cy/works/item.md": "each: true\n\ny",
    "cy/draft.md": "draft: true\ntranslated-from: 00000000\n\nNid eto",     // a translation being worked on
    "draft.md": "title: Draft source\n\nx",
    "-aside.md": "title: Aside\n\nx",                                        // unlisted is still a page
    "notes.txt": "not a page",
    ".hidden/x.md": "x",
  };
  const row = (rows: Row[], lang: string, key: string) => rows.find((r) => r.lang === lang && r.key === key);

  test("is where each translation stands, language by language, in the default's names", async () => {
    const rows = await translationRows(memory(SITE), true);
    expect(row(rows, "cy", "about.md")).toEqual({ lang: "cy", key: "about.md", standing: "fresh", draft: false });
    expect(row(rows, "fr", "about.md")).toEqual({ lang: "fr", key: "about.md", standing: "stale", draft: false });
    expect(row(rows, "cy", "contact.md")).toEqual({ lang: "cy", key: "contact.md", standing: "unchecked", draft: false });
    expect(row(rows, "cy", "blog/lleol.md")).toEqual({ lang: "cy", key: "blog/lleol.md", standing: "own", draft: false });
    expect(row(rows, "cy", "blog/post.md")).toEqual({ lang: "cy", key: "blog/post.md", standing: "missing", draft: false });
    expect(row(rows, "fr", "blog/post.md")!.standing).toBe("missing");
    expect(row(rows, "cy", "index.md")!.standing).toBe("unchecked");   // the language's home translates the default's
  });

  test("a draft translation says so; the default's draft and each: pages are nothing missing, and a stray file isn't a page", async () => {
    const rows = await translationRows(memory(SITE), true);
    expect(row(rows, "cy", "draft.md")).toEqual({ lang: "cy", key: "draft.md", standing: "stale", draft: true });
    expect(row(rows, "cy", "soon.md")).toBeUndefined();
    expect(row(rows, "fr", "soon.md")).toBeUndefined();
    expect(rows.some((r) => r.key === "works/item.md")).toBe(false);
    expect(rows.some((r) => r.key === "notes.txt" || r.key.startsWith(".hidden"))).toBe(false);
    expect(row(rows, "cy", "-aside.md")!.standing).toBe("missing");
  });

  test("another language's folder is not a tree of the default's", async () => {
    const rows = await translationRows(memory(SITE), true);
    expect(rows.some((r) => r.key.startsWith("cy/") || r.key.startsWith("fr/"))).toBe(false);
  });

  test("a site with no other language has none", async () => {
    expect(await translationRows(memory({ "index.md": "Hi", "about.md": "About" }), true)).toEqual([]);
  });

  test("is kept until the site changes", async () => {
    const files: Record<string, string> = { ...WELSH, "about.md": "title: About\n\nUs" };
    const pages = memory(files);
    const first = await translationRows(pages);
    expect(await translationRows(pages)).toBe(first);
    files["cy/about.md"] = "title: Amdanom\n\nNi";
    siteChanged();
    expect((await translationRows(pages)).find((r) => r.key === "about.md")!.standing).toBe("unchecked");
  });
});

describe("translationDraft", () => {
  const page = "title: About\naliases: /old-about\ndate: 2026-10-02\nlang: fr\n\nWe make things.";
  const hash = sourceHash(page);

  test("is the page, a draft, saying what it was made from", () => {
    const draft = translationDraft(page, "cy", "about.md");
    const { meta, body } = parseFrontMatter(draft);
    expect(meta.draft).toEqual(["true"]);
    expect(meta["translated-from"]).toEqual([hash]);
    expect(meta.title).toEqual(["About"]);       // the translator writes over it
    expect(meta.date).toEqual(["2026-10-02"]);   // and what is the same in every language stays
    expect(body).toBe("We make things.");
    // And what belongs to this one page does not: its old addresses, its own language.
    expect(meta.aliases).toBeUndefined();
    expect(meta.lang).toBeUndefined();
  });

  test("replaces what it would have said twice, in a fenced block too, and starts one for a page with none", () => {
    const again = translationDraft("---\ntitle: A\ndraft: false\ntranslated-from: abcd1234\nauthor: Me\n---\n\nWords", "cy", "a.md");
    const { meta } = parseFrontMatter(again);
    expect(meta.draft).toEqual(["true"]);
    expect(meta["translated-from"]).toHaveLength(1);
    expect(meta.author).toEqual(["Me"]);
    expect(translationDraft("Just words", "cy", "plain.md")).toBe(`draft: true\ntranslated-from: ${sourceHash("Just words")}\n\nJust words`);
  });

  test("a language's home says which language it is, and leaves its note to be written", () => {
    const { meta } = parseFrontMatter(translationDraft("title: Home\n\nHi", "cy", "index.md"));
    expect(meta.lang).toEqual(["cy"]);
    expect(meta.untranslated).toEqual([""]);
    expect(parseFrontMatter(translationDraft("title: Home\n\nHi", "cy", "blog/index.md")).meta.lang).toBeUndefined();
  });
});

describe("stamped", () => {
  test("says a translation was made from the source as it is now", () => {
    const source = "title: About\n\nUs, and more";
    const old = "title: Amdanom\ntranslated-from: 00000000\n\nNi";
    const now = stamped(old, source);
    expect(parseFrontMatter(now).meta["translated-from"]).toEqual([sourceHash(source)]);
    expect(parseFrontMatter(now).body).toBe("Ni");
    expect(parseFrontMatter(stamped("title: Amdanom\n\nNi", source)).meta["translated-from"]).toEqual([sourceHash(source)]);   // and one that had none
  });
});

describe("newLanguage", () => {
  const languages = { main: "en", others: ["cy"] };
  test("is a code the site hasn't got, and isn't the default's", () => {
    expect(newLanguage(languages, "fr")).toBe(true);
    expect(newLanguage(languages, "pt-br")).toBe(true);
    expect(newLanguage(languages, "cy")).toBe(false);
    expect(newLanguage(languages, "en")).toBe(false);
    expect(newLanguage(languages, "Welsh")).toBe(false);
    expect(newLanguage(languages, "")).toBe(false);
    expect(newLanguage(languages, "../x")).toBe(false);
  });
});
