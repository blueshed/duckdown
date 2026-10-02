// What a reader of one language can search: the pages written in it, and
// nothing of another's. One walk of the site finds everything, and the index
// is cut from it by language.
import { describe, test, expect, beforeEach } from "bun:test";
import type { Storage, Listing } from "../server/storage";
import { buildSite, searchIndex, pageList, aliasTarget, aliasTargets, searchParts, searchFile, entriesIn } from "../server/search";
import { pageKey } from "../server/listed";
import { siteChanged } from "../server/kept";

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

beforeEach(() => siteChanged());

const SITE = {
  "index.md": "title: Home\n\nWelcome home",
  "cy/index.md": "lang: cy\ntitle: Hafan\n\nCroeso adref",
  "fr/index.md": "lang: fr\ntitle: Accueil\n\nBienvenue",
  "about.md": "title: About\naliases: /old-about\n\nAbout us\n\n## Team\n\nFour people",
  "cy/about.md": "title: Amdanom\naliases: /cy/hen-amdanom\n\nAmdanom ni\n\n## Tim\n\nPedwar o bobl",
  "contact.md": "title: Contact\n\nWrite to us",
  "cy/lleol.md": "title: Lleol\n\nDim ond yma",
  "cy/draft.md": "title: Drafft\ndraft: true\n\nNid eto",
  "404.md": "title: Not found\n\nGone",
  "cy/404.md": "title: Ddim yma\n\nWedi mynd",
  "blog/index.md": "title: Blog\n\nPosts",
  "cy/blog/post.md": "title: Cofnod\n\nCofnod cyntaf",
};

const urls = (entries: { url: string }[]) => entries.map((e) => e.url);

describe("pageKey", () => {
  test("a 404 page is the root's, and a language's own", () => {
    expect(pageKey("404.md")).toBe(false);
    expect(pageKey("cy/404.md")).toBe(true);                       // as it was, when no language is known
    expect(pageKey("cy/404.md", ["cy"])).toBe(false);
    expect(pageKey("cy/404.md", ["fr"])).toBe(true);               // a folder that isn't a language's is a folder
    expect(pageKey("blog/404.md", ["cy"])).toBe(true);
    expect(pageKey("cy/about.md", ["cy"])).toBe(true);
    expect(pageKey("cy/about.txt", ["cy"])).toBe(false);
  });
});

describe("the index, by language", () => {
  test("the default's is every page that isn't in a language's folder", async () => {
    const found = urls(await searchIndex(memory(SITE), true));
    expect(found).toEqual(["/", "/about.html", "/about.html#team", "/contact.html", "/blog/"]);
  });

  test("a language's is the pages written in it, as its own site has them: no draft, no 404, none of the default's", async () => {
    expect(urls(await searchIndex(memory(SITE), true, "cy"))).toEqual([
      "/cy/", "/cy/about.html", "/cy/about.html#tim", "/cy/lleol.html", "/cy/blog/post.html",
    ]);
  });

  test("a language with only its home has that", async () => {
    expect(urls(await searchIndex(memory(SITE), true, "fr"))).toEqual(["/fr/"]);
  });

  test("a site with no other language is searched whole, whatever folders it has", async () => {
    const pages = memory({ "index.md": "Hi", "cy/index.md": "title: A folder\n\nNot a language", "cy/404.md": "Page", "404.md": "Gone" });
    expect(urls(await searchIndex(pages, true))).toEqual(["/", "/cy/", "/cy/404.html"]);
  });

  test("a language's words are its own: what is not in it is not found by it", async () => {
    const pages = memory(SITE);
    const welsh = await searchParts(pages, true, "cy");
    const english = await searchParts(pages, true);
    const words = (files: Awaited<ReturnType<typeof searchParts>>) => JSON.parse(files.index).words as string[];
    expect(words(welsh)).toContain("am");                     // amdanom
    expect(words(english)).toContain("ab");                   // about
    expect(JSON.parse(searchFile(welsh, "/search/words/am.json")!)).toHaveProperty("amdanom");
    expect(searchFile(welsh, "/search/words/ab.json")).toBeNull();     // "about" is not Welsh, nor is "write"
    expect(searchFile(english, "/search/words/am.json")).toBeNull();
    expect(searchFile(english, "/search/words/cr.json")).toBeNull();   // "croeso"
    // Each is numbered from its own first page: the parts name each other, per index.
    expect(JSON.parse(searchFile(welsh, "/search/pages/0.json")!)[0].url).toBe("/cy/");
    expect(JSON.parse(searchFile(english, "/search/pages/0.json")!)[0].url).toBe("/");
  });

  test("each language's parts are kept apart and dropped together", async () => {
    const files: Record<string, string> = { ...SITE };
    const pages = memory(files);
    const welsh = await searchParts(pages, false, "cy");
    const english = await searchParts(pages, false);
    expect(await searchParts(pages, false, "cy")).toBe(welsh);
    expect(await searchParts(pages, false)).toBe(english);
    expect(welsh).not.toBe(english);
    files["cy/lleol.md"] = "title: Lleol\n\nDim ond yma, a mwy";
    siteChanged();
    expect(await searchParts(pages, false, "cy")).not.toBe(welsh);
  });

  test("entriesIn cuts any entries the same way", () => {
    const entries = ["/", "/about.html", "/cy/", "/cy/about.html#x", "/fr/", "/cymru/x.html"].map((url) => ({ url, title: "", section: "", description: "", date: "", text: "" }));
    expect(urls(entriesIn(entries, ["cy", "fr"], ""))).toEqual(["/", "/about.html", "/cymru/x.html"]);   // /cymru/ is no language's
    expect(urls(entriesIn(entries, ["cy", "fr"], "cy"))).toEqual(["/cy/", "/cy/about.html#x"]);
    expect(urls(entriesIn(entries, ["cy", "fr"], "fr"))).toEqual(["/fr/"]);
  });
});

describe("what the sitemap and the addresses that move take from the same walk", () => {
  test("the sitemap's pages are every language's, and no 404 page", async () => {
    const { pages: listed } = await buildSite(memory(SITE), "", true);
    expect(urls(listed)).not.toContain("/404.html");
    expect(urls(listed)).not.toContain("/cy/404.html");
    expect(urls(listed)).not.toContain("/cy/draft.html");
    expect(new Set(urls(listed))).toEqual(new Set([
      "/", "/about.html", "/contact.html", "/blog/", "/cy/", "/cy/about.html", "/cy/lleol.html", "/cy/blog/post.html", "/fr/",
    ]));
  });

  test("an address a page of a language used to have still moves", async () => {
    const pages = memory(SITE);
    expect(await aliasTarget(pages, "/cy/hen-amdanom", true)).toBe("/cy/about.html");
    expect(await aliasTarget(pages, "/old-about", true)).toBe("/about.html");
    const moving = await aliasTargets(pages, true);
    expect(moving).toContain("/old-about");
    expect(moving).toContain("/cy/hen-amdanom");
  });
});
