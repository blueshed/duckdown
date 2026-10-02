// duckdown translations status|stamp (translations.ts): what the editor's
// Translations drawer shows and does, from a terminal, against a folder of
// pages through the storage layer (n191).
import { describe, test, expect, beforeEach } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { LocalStorage } from "../server/storage";
import { siteChanged } from "../server/kept";
import { sourceHash } from "../server/languages";
import { translationsCommand } from "../server/translations";
import { cli } from "../server/cli";

beforeEach(() => siteChanged());

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const WORKS = {
  fields: [{ name: "src", kind: "image" }, { name: "title", kind: "text" }, { name: "caption", kind: "long" }],
  groups: [{ name: "all", items: [
    { src: "a.jpg", title: "First Light", caption: "Ink" },
    { src: "b.jpg", title: "Second Wind", caption: "Oil" },
    { src: "c.jpg", title: "Third", caption: "Wax" },
  ] }],
};

// A site in English and Welsh, one of each standing.
function site(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(RUN, "translations-command-"));
  const files: Record<string, string> = {
    "index.md": "title: Home\n\nHi\n",
    "cy/index.md": "lang: cy\ntitle: Hafan\nuntranslated: Nid eto.\n\nCroeso\n",
    "about.md": "title: About\n\nAbout us\n",
    "cy/about.md": "title: Amdanom\ntranslated-from: 00000000\n\nAmdanom ni\n",                       // stale
    "guide/themes.md": "title: Themes\n\nStyle\n",
    "cy/guide/themes.md": "title: Themâu\n\nArddull\n",                                                // unchecked
    "guide/images.md": "title: Images\n\nPictures\n",
    "cy/guide/images.md": `title: Delweddau\ntranslated-from: ${sourceHash("title: Images\n\nPictures\n")}\n\nLluniau\n`,   // fresh
    "contact.md": "title: Contact\n\nWrite\n",                                                         // missing
    "cy/lleol.md": "title: Lleol\n\nDim ond yma\n",                                                    // own
    "works/collection.json": json(WORKS),
    "works/item.md": "each: true\n\n<p>{{item-title}}</p>",
    "cy/works/collection.json": json({ items: { "first-light": { title: "Golau cyntaf" }, "second-wind": { title: "Ail wynt", "translated-from": "00000000" } }, groups: { all: "Pob un" } }),
    ...extra,
  };
  for (const [key, body] of Object.entries(files)) {
    mkdirSync(join(dir, key, ".."), { recursive: true });
    writeFileSync(join(dir, key), body);
  }
  const lines: string[] = [];
  const run = (...args: string[]) => translationsCommand(args, new LocalStorage(dir), (line) => lines.push(line));
  const read = (key: string) => readFileSync(join(dir, key), "utf8");
  return { dir, run, lines, read };
}

describe("duckdown translations status", () => {
  test("says each language's counts, and what wants attention, as a person would read it", async () => {
    const { run, lines } = site();
    expect(await run("status")).toBe(0);
    expect(lines).toEqual([
      "cy: 1 up to date, 2 out of date, 3 not checked, 1 has no original, 2 not translated yet",
      "  out of date         cy/about.md",
      "  not translated yet  cy/contact.md",
      "  not checked         cy/guide/themes.md",
      "  not checked         cy/index.md",
      "  not checked         cy/works/collection.json#first-light",
      "  out of date         cy/works/collection.json#second-wind",
      "  not translated yet  cy/works/collection.json#third",
    ]);
  });

  test("names a language to look at one, and is the same rows as JSON for a script", async () => {
    const { run, lines } = site({ "fr/index.md": "lang: fr\n\nBonjour\n" });
    expect(await run("status", "fr")).toBe(0);
    expect(lines[0]).toBe("fr: 1 not checked, 7 not translated yet");   // its home, and every other page and item of the default's
    lines.length = 0;
    expect(await run("status", "cy", "--json")).toBe(0);
    const rows = JSON.parse(lines.join("\n"));
    expect(rows.every((r: { lang: string }) => r.lang === "cy")).toBe(true);
    expect(rows).toContainEqual({ lang: "cy", key: "about.md", standing: "stale", draft: false });
    expect(rows).toContainEqual({ lang: "cy", key: "works/collection.json#first-light", standing: "unchecked", draft: false });
  });

  test("says a draft is one, and that a language has nothing to translate", async () => {
    const { run, lines } = site({ "cy/draft.md": "title: Drafft\ndraft: true\n\nx\n", "draft.md": "title: Draft\n\nx\n" });
    await run("status", "cy");
    expect(lines).toContain("  not checked         cy/draft.md (draft)");
    // A language with no pages of its own and nothing of the default's to translate: only its home.
    const bare = mkdtempSync(join(RUN, "translations-bare-"));
    writeFileSync(join(bare, "index.md"), "draft: true\n\nx\n");
    mkdirSync(join(bare, "cy"));
    writeFileSync(join(bare, "cy", "index.md"), "lang: cy\ndraft: true\n\nx\n");
    const said: string[] = [];
    siteChanged();
    await translationsCommand(["status"], new LocalStorage(bare), (l) => said.push(l));
    expect(said).toEqual(["cy: 1 not checked", "  not checked         cy/index.md (draft)"]);
  });

  test("a site with one language says so, and is no rows as JSON", async () => {
    const one = mkdtempSync(join(RUN, "translations-one-"));
    writeFileSync(join(one, "index.md"), "title: Home\n\nHi\n");
    const said: string[] = [];
    const store = new LocalStorage(one);
    expect(await translationsCommand(["status"], store, (l) => said.push(l))).toBe(0);
    expect(await translationsCommand(["status", "--json"], store, (l) => said.push(l))).toBe(0);
    expect(said).toEqual(["This site has one language.", "[]"]);
  });

  test("refuses a language the site hasn't got, and what isn't the command", async () => {
    const { run } = site();
    await expect(run("status", "de")).rejects.toThrow("de isn't a language of this site (cy)");
    await expect(translationsCommand(["status", "de"], new LocalStorage(mkdtempSync(join(RUN, "translations-none-"))), () => {}))
      .rejects.toThrow("de isn't a language of this site, which has one language");
    await expect(run("status", "cy", "fr")).rejects.toThrow("usage:");
    await expect(run("status", "--nope")).rejects.toThrow("usage:");
    await expect(run("stamp")).rejects.toThrow("usage:");
    await expect(run("nothing")).rejects.toThrow("usage:");
  });
});

describe("duckdown translations stamp", () => {
  test("a page: said to be made from the original as it is now, and then it is up to date", async () => {
    const { run, lines, read } = site();
    expect(await run("stamp", "cy/about.md")).toBe(0);
    expect(read("cy/about.md")).toBe(`title: Amdanom\ntranslated-from: ${sourceHash("title: About\n\nAbout us\n")}\n\nAmdanom ni\n`);
    expect(lines).toEqual(["stamped cy/about.md", "stamped 1 page(s) and 0 item(s)", "A running server shows it after the next save in the editor, or when it restarts."]);
    lines.length = 0;
    await run("status", "cy");
    expect(lines.some((l) => l.includes("cy/about.md"))).toBe(false);
  });

  test("one already up to date is left exactly as it is", async () => {
    const { run, lines, dir } = site();
    const file = join(dir, "cy/guide/images.md");
    const before = statSync(file).mtimeMs;
    await Bun.sleep(15);
    expect(await run("stamp", "cy/guide/images.md")).toBe(0);
    expect(statSync(file).mtimeMs).toBe(before);
    expect(lines).toEqual(["stamped 0 page(s) and 0 item(s)"]);
  });

  test("a collection's words: each item that has them, the file otherwise as it was", async () => {
    const { run, lines, read } = site();
    await run("stamp", "cy/works/collection.json");
    const file = JSON.parse(read("cy/works/collection.json"));
    expect(file.groups).toEqual({ all: "Pob un" });
    expect(file.items["first-light"]["translated-from"]).toMatch(/^[0-9a-f]{8}$/);
    expect(file.items["second-wind"]["translated-from"]).toMatch(/^[0-9a-f]{8}$/);
    expect(file.items["second-wind"]["translated-from"]).not.toBe("00000000");
    expect(file.items.third).toBeUndefined();                                   // nothing to have been made from
    expect(lines[0]).toBe("stamped 0 page(s) and 2 item(s)");
    lines.length = 0;
    await run("status", "cy");
    expect(lines.some((l) => l.includes("first-light") || l.includes("second-wind"))).toBe(false);
    // Again, and nothing is left to stamp.
    lines.length = 0;
    await run("stamp", "cy/works/collection.json");
    expect(lines).toEqual(["stamped 0 page(s) and 0 item(s)"]);
  });

  test("a folder, a language, and a path as the site has it: every translation under it, items too", async () => {
    const { run, lines, read } = site();
    await run("stamp", "pages/cy/guide/");
    expect(read("cy/guide/themes.md")).toContain(`translated-from: ${sourceHash("title: Themes\n\nStyle\n")}`);
    expect(lines[0]).toBe("stamped cy/guide/themes.md");
    lines.length = 0;
    await run("stamp", "cy");
    expect(lines).toContain("stamped cy/about.md");
    expect(lines).toContain("stamped cy/index.md");
    expect(lines).toContain("note: cy/lleol.md: a page of cy's own, with no original to have been made from — left as it is");
    expect(lines).toContain("stamped 2 page(s) and 2 item(s)");        // themes was stamped above
    lines.length = 0;
    await run("status", "cy");
    expect(lines).toEqual([
      "cy: 6 up to date, 1 has no original, 2 not translated yet",
      "  not translated yet  cy/contact.md",
      "  not translated yet  cy/works/collection.json#third",
    ]);
  });

  test("says what it can't make anything of, and leaves an each: page alone", async () => {
    const { run, lines } = site({
      "cy/works/item.md": "each: true\n\n<p>{{item-title}} (Cymraeg)</p>",
      "other/collection.json": json(WORKS),
      "cy/other/collection.json": "{ nope",
      "cy/nocollection/collection.json": json({ items: {} }),
    });
    await run("stamp", "cy/works/item.md", "cy/nocollection/collection.json");
    expect(lines).toEqual(["note: cy/nocollection/collection.json: no collection of the default's to be made from, or no words in cy yet", "stamped 0 page(s) and 0 item(s)"]);
    await expect(run("stamp", "cy/other/collection.json")).rejects.toThrow("cy/other/collection.json: ");
  });

  test("refuses what isn't a translation, or isn't there", async () => {
    const { run } = site();
    await expect(run("stamp", "about.md")).rejects.toThrow("about.md isn't in a language's folder (cy)");
    await expect(run("stamp", "cy/nothing.md")).rejects.toThrow("cy/nothing.md: there is nothing there to stamp");
    await expect(run("stamp", "cy/nothing")).rejects.toThrow("cy/nothing: there is nothing there to stamp");
    const one = mkdtempSync(join(RUN, "translations-stamp-one-"));
    writeFileSync(join(one, "index.md"), "x\n");
    await expect(translationsCommand(["stamp", "about.md"], new LocalStorage(one), () => {})).rejects.toThrow("(this site has none)");
  });
});

describe("through duckdown", () => {
  test("the verb is there, and without its own words says how to use it", async () => {
    const lines: string[] = [];
    const error = console.error;
    console.error = (line: string) => lines.push(line);
    try {
      expect(await cli(["translations"])).toBe(1);
    } finally {
      console.error = error;
    }
    expect(lines[0]).toStartWith("duckdown translations: usage:\nduckdown translations status [lang] [--json]");
  });
});
