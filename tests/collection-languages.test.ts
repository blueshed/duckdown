// A collection in more than one language: the default's items, with the words
// the language has given them, at the language's addresses.
import { describe, test, expect, beforeEach, spyOn } from "bun:test";
import type { Storage, Listing } from "../server/storage";
import { loadCollection, itemAt, itemHash, collectionRows, itemCounterparts, fillCollections, collectionProblems, type Collection } from "../server/collection";
import { siteChanged } from "../server/kept";

// An in-memory Storage over { "works/collection.json": "…" }.
function memory(files: Record<string, string>): Storage {
  return {
    async list(prefix) {
      const dir = prefix ? `${prefix}/` : "";
      const out: Listing = { files: [], folders: [] };
      for (const key of Object.keys(files).filter((k) => k.startsWith(dir))) {
        const rest = key.slice(dir.length);
        const name = rest.split("/")[0]!;
        if (rest === name) out.files.push({ name, path: key, file: true, size: 0, type: "text/plain" });
        else if (!out.folders.some((f) => f.name === name)) out.folders.push({ name, path: `${dir}${name}`, file: false });
      }
      return out;
    },
    async read(key) { return files[key]!; },
    async readBytes(key) { return new TextEncoder().encode(files[key]); },
    async write(key, body) { files[key] = String(body); },
    async remove(key) { delete files[key]; },
    async exists(key) { return key in files; },
    mime: () => "text/plain",
  };
}

beforeEach(() => siteChanged());

const json = (value: unknown) => JSON.stringify(value);
const WORKS = {
  fields: [
    { name: "src", kind: "image" },
    { name: "title", kind: "text" },
    { name: "caption", kind: "long" },
    { name: "year", kind: "number" },
  ],
  labels: { year: { "1961": "Early years" } },
  groups: [
    {
      name: "Early work",
      items: [
        { src: "a.jpg", title: "First Light", caption: "Ink on paper", year: 1961, aliases: ["/first-light-1961"] },
        { src: "b.jpg", title: "Second Wind", caption: "Oil", year: 1962 },
      ],
      groups: [{ name: "Studies", items: [{ src: "c.jpg", title: "Study in Green", caption: "Pencil", year: 1963 }] }],
    },
    { name: "Later", items: [{ src: "d.jpg", title: "Deep", caption: "Sea", year: 1970 }] },
  ],
};

const SITE = (welsh: Record<string, string> = {}) => ({
  "index.md": "title: Home\n\nHi",
  "cy/index.md": "lang: cy\ntitle: Hafan\nuntranslated: Nid eto.\n\nCroeso",
  "fr/index.md": "lang: fr\n\nBonjour",
  "works/collection.json": json(WORKS),
  "works/item.md": "each: true\ntitle: {{item-title}}\n\n<p>{{item-caption}}</p>",
  "works/index.md": "title: Works\n\n{{items}}",
  ...welsh,
});

// What the default's items hash to, which a translation records.
async function hashes(pages: Storage) {
  const base = (await loadCollection(pages, "works", true))!;
  return Object.fromEntries(base.items.map((item) => [item.slug, itemHash(base, item)]));
}

const welsh = (hash: Record<string, string>) => json({
  items: {
    "first-light": { title: "Golau cyntaf", caption: "Inc ar bapur", "translated-from": hash["first-light"] },
    "second-wind": { title: "Gwynt", "translated-from": "00000000" },        // the default's has changed since
    "study-in-green": { title: "Astudiaeth" },                               // no record of what it was made from
  },
  groups: { "Early work": "Gwaith cynnar", Later: "" },
  labels: { year: { "1962": "Dwy flynedd ar ôl" } },
});

describe("itemHash", () => {
  test("is what a translator reads: the text and long fields, in the order the file declares them", async () => {
    const base = (await loadCollection(memory(SITE()), "works", true))!;
    const first = base.items[0]!;
    const was = itemHash(base, first);
    expect(was).toMatch(/^[0-9a-f]{8}$/);
    expect(itemHash(base, { ...first, fields: { ...first.fields, year: "1999", src: "z.jpg" } })).toBe(was);   // a number and a picture are every language's
    expect(itemHash(base, { ...first, fields: { ...first.fields, caption: "Ink and wash" } })).not.toBe(was);
    expect(itemHash(base, { ...first, fields: { ...first.fields, title: "First light" } })).not.toBe(was);
    expect(itemHash(base, { ...first, fields: { ...first.fields, caption: " Ink on paper \r\n" } })).toBe(was);   // not whitespace or line endings
    expect(itemHash(base, { ...first, fields: { title: "First Light" } })).not.toBe(was);                          // and a field it lacks is empty
  });
});

describe("a collection in a language", () => {
  const files = async () => {
    const pages = memory(SITE());
    const hash = await hashes(pages);
    return SITE({
      "cy/works/collection.json": welsh(hash),
      "cy/works/item.md": "each: true\ntitle: {{item-title}} (Cymraeg)\n\n<p>{{item-caption}}</p>",
    });
  };

  test("is the default's items at the language's addresses, in the same groups, with its own words where it has them", async () => {
    const collection = (await loadCollection(memory(await files()), "cy/works", true))!;
    expect(collection.lang).toBe("cy");
    expect(collection.folder).toBe("cy/works");
    expect(collection.items.map((i) => i.href)).toEqual([
      "/cy/works/first-light/", "/cy/works/second-wind/", "/cy/works/study-in-green/", "/cy/works/deep/",
    ]);
    expect(collection.items.map((i) => i.key)).toEqual([
      "cy/works/first-light/index.md", "cy/works/second-wind/index.md", "cy/works/study-in-green/index.md", "cy/works/deep/index.md",
    ]);
    expect(collection.items.map((i) => i.title)).toEqual(["Golau cyntaf", "Gwynt", "Astudiaeth", "Deep"]);
    // A field it didn't translate is the default's: "Gwynt" has no caption of its own.
    expect(collection.items.map((i) => i.caption)).toEqual(["Inc ar bapur", "Oil", "Pencil", "Sea"]);
    expect(collection.items.map((i) => i.untranslated)).toEqual([false, false, false, true]);
    // The picture, the year and the slug are the default's.
    expect(collection.items[0]!.thumb).toBe(collection.items[0]!.thumb);
    expect(collection.items[0]!.fields.year).toBe("1961");
    expect(collection.items[0]!.fields.slug).toBe("first-light");
    expect(collection.items[0]!.aliases).toEqual([]);   // an old address is the default's, and still moves there
  });

  test("shares the default's pictures and fields, and keeps its groups in their order, labelled in the language", async () => {
    const pages = memory(await files());
    const base = (await loadCollection(pages, "works", true))!;
    const collection = (await loadCollection(pages, "cy/works", true))!;
    expect(collection.fields).toEqual(base.fields);
    expect(collection.items.map((i) => i.src)).toEqual(base.items.map((i) => i.src));
    expect(collection.groups.map((g) => g.label)).toEqual(["Gwaith cynnar", "Later"]);   // an empty label is none
    expect(collection.groups[0]!.groups.map((g) => g.label)).toEqual(["Studies"]);
    expect(collection.groups[0]!.items.map((i) => i.group)).toEqual([collection.groups[0], collection.groups[0]]);
    expect(collection.groups[0]!.groups[0]!.items[0]!.group).toBe(collection.groups[0]!.groups[0]);
    expect(collection.bySlug.get("deep")).toBe(collection.items[3]!);
    expect(collection.labels.year).toEqual({ "1961": "Early years", "1962": "Dwy flynedd ar ôl" });
    // And the default's is as it was.
    expect(base.items.map((i) => i.href)).toEqual(["/works/first-light/", "/works/second-wind/", "/works/study-in-green/", "/works/deep/"]);
    expect(base.items.every((i) => i.untranslated === undefined)).toBe(true);
    expect(base.lang).toBeUndefined();
  });

  test("its each: page is the language's own when it has written one, and the default's when it hasn't (or is writing it)", async () => {
    const all: Record<string, string> = await files();
    expect((await loadCollection(memory(all), "cy/works", true))!.each!.key).toBe("cy/works/item.md");
    expect((await loadCollection(memory(all), "cy/works", true))!.each!.meta.title).toEqual(["{{item-title}} (Cymraeg)"]);

    const { "cy/works/item.md": _, ...none } = all;
    expect((await loadCollection(memory(none), "cy/works", true))!.each!.key).toBe("works/item.md");

    siteChanged();
    const draft = { ...all, "cy/works/item.md": "each: true\ndraft: true\n\nwriting it" };
    expect((await loadCollection(memory(draft), "cy/works", true))!.each!.key).toBe("works/item.md");

    siteChanged();
    const notEach = { ...all, "cy/works/item.md": "title: Not an each page\n\nx" };
    expect((await loadCollection(memory(notEach), "cy/works", true))!.each!.key).toBe("works/item.md");
  });

  test("a language that hasn't translated anything has every item, as the default's, untranslated", async () => {
    const collection = (await loadCollection(memory(SITE()), "cy/works", true))!;
    expect(collection.items.map((i) => i.untranslated)).toEqual([true, true, true, true]);
    expect(collection.items.map((i) => i.title)).toEqual(["First Light", "Second Wind", "Study in Green", "Deep"]);
    expect(collection.items[0]!.href).toBe("/cy/works/first-light/");
    expect(collection.each!.key).toBe("works/item.md");
    expect(collection.problems).toEqual([]);
  });

  test("an item is found by a slug it used to have", async () => {
    const hash = await hashes(memory(SITE()));
    const pages = memory(SITE({ "cy/works/collection.json": json({ items: { "first-light-1961": { title: "Hen enw", "translated-from": hash["first-light"] } } }) }));
    const collection = (await loadCollection(pages, "cy/works", true))!;
    expect(collection.items[0]!.title).toBe("Hen enw");
    expect(collection.problems).toEqual([]);
  });

  test("says what is wrong with the language's file, and keeps the rest", async () => {
    const said = spyOn(console, "error").mockImplementation(() => {});
    try {
      const bad = json({ items: { "no-such-item": { title: "x" }, "first-light": { title: "Golau", src: "z.jpg", year: "1", caption: 7, extra: "y" }, "second-wind": "text", "study-in-green": [1] } });
      const collection = (await loadCollection(memory(SITE({ "cy/works/collection.json": bad })), "cy/works", true))!;
      expect(collection.problems).toEqual([
        'cy/works/collection.json: "no-such-item" isn\'t an item of works/collection.json',
        'cy/works/collection.json: "first-light" says "src", which isn\'t a text field of works/collection.json — only text and long fields are translated',
        'cy/works/collection.json: "first-light" says "year", which isn\'t a text field of works/collection.json — only text and long fields are translated',
        'cy/works/collection.json: "first-light" says "extra", which isn\'t a text field of works/collection.json — only text and long fields are translated',
        'cy/works/collection.json: "second-wind" should be { "title": …, "translated-from": … }',
        'cy/works/collection.json: "study-in-green" should be { "title": …, "translated-from": … }',
      ]);
      expect(collection.items[0]!.title).toBe("Golau");
      expect(collection.items[0]!.caption).toBe("7");   // a number is words too
      expect(said).toHaveBeenCalledTimes(6);            // failures speak: in the log as the default's do
    } finally {
      said.mockRestore();
    }
  });

  test("a group key nothing has, and a labels field nothing declares, are said — not dropped in silence (n186)", async () => {
    const said = spyOn(console, "error").mockImplementation(() => {});
    try {
      const named = { ...WORKS, groups: [{ name: "early", label: "Early work", items: [{ src: "a.jpg", title: "First Light" }], groups: [{ name: "studies", items: [] }] }] };
      const cy = json({ groups: { "Early work": "Gwaith cynnar", studies: "Astudiaethau", elsewhere: "Mewn man arall" }, labels: { year: { "1961": "x" }, decade: { "60s": "y" } } });
      const collection = (await loadCollection(memory(SITE({ "works/collection.json": json(named), "cy/works/collection.json": cy })), "cy/works", true))!;
      expect(collection.problems).toEqual([
        'cy/works/collection.json: "Early work" isn\'t a group of works/collection.json — groups are keyed by a group\'s name, and "Early work" is the label of "early"',
        'cy/works/collection.json: "elsewhere" isn\'t a group of works/collection.json — groups are keyed by a group\'s name',
        'cy/works/collection.json: "decade" isn\'t a field of works/collection.json, so its labels are never shown',
      ]);
      expect(collection.groups[0]!.label).toBe("Early work");         // the wrong key changed nothing
      expect(collection.groups[0]!.groups[0]!.label).toBe("Astudiaethau");   // a subgroup's name is a name
      expect(said).toHaveBeenCalledTimes(3);
    } finally {
      said.mockRestore();
    }
  });

  test("a file that isn't JSON, or isn't an object, is the language with nothing translated, and says so", async () => {
    const said = spyOn(console, "error").mockImplementation(() => {});
    try {
      const broken = (await loadCollection(memory(SITE({ "cy/works/collection.json": "{ nope" })), "cy/works", true))!;
      expect(broken.problems).toHaveLength(1);
      expect(broken.problems[0]).toStartWith("cy/works/collection.json: ");
      expect(broken.items.every((i) => i.untranslated)).toBe(true);
      siteChanged();
      const list = (await loadCollection(memory(SITE({ "cy/works/collection.json": "[]" })), "cy/works", true))!;
      expect(list.problems).toEqual(["cy/works/collection.json: not an object"]);
      siteChanged();
      const bare = (await loadCollection(memory(SITE({ "cy/works/collection.json": json({ items: [], groups: [], labels: 4 }) })), "cy/works", true))!;
      expect(bare.problems).toEqual([]);
      expect(bare.items.every((i) => i.untranslated)).toBe(true);
    } finally {
      said.mockRestore();
    }
  });

  test("a collection the language has of its own, where the default has none, is read like any", async () => {
    const own = json({ groups: [{ name: "Lleol", items: [{ src: "x.jpg", title: "Dim ond yma" }] }] });
    const collection = (await loadCollection(memory(SITE({ "cy/lleol/collection.json": own })), "cy/lleol", true))!;
    expect(collection.lang).toBeUndefined();
    expect(collection.folder).toBe("cy/lleol");
    expect(collection.items.map((i) => i.href)).toEqual(["/cy/lleol/dim-ond-yma/"]);
    expect(collection.items[0]!.untranslated).toBeUndefined();
    expect(await loadCollection(memory(SITE()), "cy/lleol", true)).toBeNull();
  });

  test("the language's home can have a collection too", async () => {
    const home = SITE({ "collection.json": json({ groups: [{ name: "g", items: [{ src: "x.jpg", title: "Top" }] }] }), "cy/collection.json": json({ items: { top: { title: "Brig" } } }) });
    const collection = (await loadCollection(memory(home), "cy", true))!;
    expect(collection.items.map((i) => [i.href, i.title])).toEqual([["/cy/top/", "Brig"]]);
  });

  test("problems that collide with a page are the language's own pages", async () => {
    const all = { ...(await files()), "cy/works/deep.md": "title: A page\n\nx" };
    const said = spyOn(console, "error").mockImplementation(() => {});
    try {
      const problems = await collectionProblems(memory(all), "cy/works", true);
      expect(problems).toHaveLength(1);
      expect(problems[0]).toContain("/cy/works/deep/");
    } finally {
      said.mockRestore();
    }
  });
});

describe("an item at the language's address", () => {
  const files = async () => {
    const hash = await hashes(memory(SITE()));
    return SITE({ "cy/works/collection.json": welsh(hash) });
  };

  test("is found, translated or not, and is nothing the collection doesn't hold", async () => {
    const pages = memory(await files());
    expect((await itemAt(pages, "cy/works/first-light", true))!.item.title).toBe("Golau cyntaf");
    expect((await itemAt(pages, "cy/works/deep", true))!.item.untranslated).toBe(true);
    expect(await itemAt(pages, "cy/works/nowhere", true)).toBeNull();
    expect((await itemAt(pages, "works/first-light", true))!.item.title).toBe("First Light");
  });

  test("a language with no file of its own has every item at its address all the same", async () => {
    expect((await itemAt(memory(SITE()), "cy/works/first-light", true))!.item.untranslated).toBe(true);
  });
});

describe("where an item stands", () => {
  test("is fresh, stale, unchecked or missing, per language, named by the file and the slug", async () => {
    const pages = memory(SITE());
    const hash = await hashes(pages);
    const rows = await collectionRows(memory(SITE({ "cy/works/collection.json": welsh(hash) })), true);
    const of = (lang: string, slug: string) => rows.find((r) => r.lang === lang && r.key === `works/collection.json#${slug}`);
    expect(of("cy", "first-light")).toEqual({ lang: "cy", key: "works/collection.json#first-light", standing: "fresh", draft: false });
    expect(of("cy", "second-wind")!.standing).toBe("stale");
    expect(of("cy", "study-in-green")!.standing).toBe("unchecked");
    expect(of("cy", "deep")!.standing).toBe("missing");
    expect(of("fr", "first-light")!.standing).toBe("missing");       // a language with no file
    expect(rows.filter((r) => r.lang === "fr")).toHaveLength(4);
  });

  test("a translation that records its source in capitals is read as it is", async () => {
    const hash = await hashes(memory(SITE()));
    const rows = await collectionRows(memory(SITE({ "cy/works/collection.json": json({ items: { "first-light": { title: "x", "translated-from": hash["first-light"]!.toUpperCase() } } }) })), true);
    expect(rows.find((r) => r.lang === "cy" && r.key.endsWith("#first-light"))!.standing).toBe("fresh");
  });

  test("a site with no other language, or no collection, has none", async () => {
    expect(await collectionRows(memory({ "works/collection.json": json(WORKS) }), true)).toEqual([]);
    expect(await collectionRows(memory({ "index.md": "Hi", "cy/index.md": "lang: cy\n\nx" }), true)).toEqual([]);
  });

  test("a collection.json that isn't one the walk can read is left out", async () => {
    const said = spyOn(console, "error").mockImplementation(() => {});
    try {
      const pages = memory({ "index.md": "Hi", "cy/index.md": "lang: cy\n\nx", "works/collection.json": json(WORKS), "cy/other/collection.json": json({ groups: [] }) });
      const rows = await collectionRows(pages, true);
      expect(rows.every((r) => r.key.startsWith("works/"))).toBe(true);   // another's own collection has nothing to translate
    } finally {
      said.mockRestore();
    }
  });
});

describe("itemCounterparts", () => {
  const files = async () => SITE({ "cy/works/collection.json": welsh(await hashes(memory(SITE()))) });

  test("an item is in every language: written where it has words, standing in where it hasn't", async () => {
    const pages = memory(await files());
    const base = (await loadCollection(pages, "works", true))!;
    const found = await itemCounterparts(pages, { collection: base, item: base.bySlug.get("first-light")! });
    expect(found).toEqual([
      { lang: "en", kind: "translated", key: "works/first-light/index.md" },
      { lang: "cy", kind: "translated", key: "cy/works/first-light/index.md" },
      { lang: "fr", kind: "fallback", key: "works/first-light/index.md" },
    ]);
  });

  test("whichever language it is asked from, it is the same list", async () => {
    const pages = memory(await files());
    const cy = (await loadCollection(pages, "cy/works", true))!;
    const fromWelsh = await itemCounterparts(pages, { collection: cy, item: cy.bySlug.get("deep")! });
    expect(fromWelsh).toEqual([
      { lang: "en", kind: "translated", key: "works/deep/index.md" },
      { lang: "cy", kind: "fallback", key: "works/deep/index.md" },
      { lang: "fr", kind: "fallback", key: "works/deep/index.md" },
    ]);
    const fr = (await loadCollection(pages, "fr/works", true))!;
    expect((await itemCounterparts(pages, { collection: fr, item: fr.bySlug.get("deep")! })).map((c) => c.kind)).toEqual(["translated", "fallback", "fallback"]);
  });

  test("an item of a collection whose items have no pages is in no language to switch to", async () => {
    const pages = memory({ ...(await files()), "works/item.md": "title: Not an each page\n\nx" });
    const base = (await loadCollection(pages, "works", true))!;
    expect(await itemCounterparts(pages, { collection: base, item: base.items[0]! })).toEqual([]);
  });

  test("a collection of the language's own has none either", async () => {
    const own = json({ groups: [{ name: "g", items: [{ src: "x.jpg", title: "Dim ond yma" }] }] });
    const pages = memory(SITE({ "cy/lleol/collection.json": own, "cy/lleol/item.md": "each: true\n\nx" }));
    const lleol = (await loadCollection(pages, "cy/lleol", true))!;
    expect(await itemCounterparts(pages, { collection: lleol, item: lleol.items[0]! })).toEqual([]);
  });

  test("a root collection's items are named without a folder", async () => {
    const pages = memory(SITE({
      "collection.json": json({ groups: [{ name: "g", items: [{ src: "x.jpg", title: "Top" }] }] }),
      "item.md": "each: true\n\nx",
      "cy/collection.json": json({ items: { top: { title: "Brig" } } }),
    }));
    const top = (await loadCollection(pages, "", true))!;
    expect(await itemCounterparts(pages, { collection: top, item: top.items[0]! })).toEqual([
      { lang: "en", kind: "translated", key: "top/index.md" },
      { lang: "cy", kind: "translated", key: "cy/top/index.md" },
      { lang: "fr", kind: "fallback", key: "top/index.md" },
    ]);
  });
});

describe("an overview in a language", () => {
  test("{{items}} in the language's site is the language's: its titles, its headings, its addresses", async () => {
    const hash = await hashes(memory(SITE()));
    const pages = memory(SITE({ "cy/works/collection.json": welsh(hash) }));
    const html = await fillCollections("<p>{{items}}</p>", { pages, folder: "cy/works", debug: true });
    expect(html).toContain('<a class="item" href="/cy/works/first-light/">');
    expect(html).toContain("Golau cyntaf");
    expect(html).toContain("<h2>Gwaith cynnar</h2>");
    expect(html).not.toContain('href="/works/');
    // And by a field: the labels are the language's too.
    const byYear = await fillCollections("{{items by=year}}", { pages, folder: "cy/works", debug: true });
    expect(byYear).toContain("1962 - Dwy flynedd ar ôl");
  });
});
