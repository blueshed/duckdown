// A folder of pages duckdown writes for you: collection.json, its slugs, its
// overviews, and the addresses it used to answer at.
import { describe, test, expect, spyOn } from "bun:test";
import type { Storage, Listing } from "../server/storage";
import {
  SLUG, slugify, fragmentId, aliasKey, thumbName, parseCollection, parseArgs,
  itemsHtml, groupsHtml, neighbour, itemValue, fillCollections, sortValues,
  loadCollection, collectionsChanged, collectionPath, collisions, collectionProblems, itemAt,
} from "../server/collection";

// An in-memory Storage over { "gallery/collection.json": "…" }.
function memory(files: Record<string, string>): Storage {
  return {
    async list(prefix) {
      const dir = prefix ? `${prefix}/` : "";
      const out: Listing = { files: [], folders: [] };
      for (const key of Object.keys(files).filter((k) => k.startsWith(dir))) {
        const rest = key.slice(dir.length);
        const name = rest.split("/")[0]!;
        if (rest === name) out.files.push({ name, path: `/${key}`, file: true, size: 0, type: "application/json" });
        else if (!out.folders.some((f) => f.name === name)) out.folders.push({ name, path: `/${dir}${name}`, file: false });
      }
      return out;
    },
    async read(key) { return files[key]!; },
    async readBytes(key) { return new TextEncoder().encode(files[key]); },
    async write(key, body) { files[key] = String(body); },
    async remove(key) { delete files[key]; },
    async exists(key) { return key in files; },
    mime: () => "application/json",
  };
}

const json = (value: unknown) => JSON.stringify(value);

const group = (name: string, items: unknown[], extra: Record<string, unknown> = {}) =>
  ({ name, items, ...extra });

const titled = (...titles: string[]) =>
  parseCollection("works", json({ groups: [group("all", titles.map((title) => ({ title })))] }));

describe("slugify", () => {
  // The bug this feature exists to make impossible: the site being ported
  // slugged titles keeping quotes, backticks and curly apostrophes, compared
  // the raw (percent-encoded) pathname against them, missed, and served the
  // wrong painting with a 200. Every slug is [a-z0-9-] or it is nothing.
  test("a title becomes an address a browser can't disagree about", () => {
    const cases: [string, string][] = [
      [`L"Etoile 1976`, "l-etoile-1976"],
      [`"B"`, "b"],
      [`"I" 1966`, "i-1966"],
      ["Polly Underground 1976`", "polly-underground-1976"],
      ["Don’t write everything down", "don-t-write-everything-down"],
      ["Café Ölé", "cafe-ole"],                 // accents fold rather than vanish
      ["  Take  Five  ", "take-five"],
    ];
    for (const [title, slug] of cases) {
      expect(slugify(title)).toBe(slug);
      expect(slug).toMatch(SLUG);
    }
  });

  test("every item of a collection gets a slug of that shape, whatever it is called", () => {
    const collection = titled(...[
      `L"Etoile 1976`, `"B"`, `"I" 1966`, "Polly Underground 1976`", "Don’t write everything down", "Café Ölé", "…", "",
    ]);
    expect(collection.items).toHaveLength(8);
    for (const item of collection.items) expect(item.slug).toMatch(SLUG);
  });

  test("a title with nothing usable in it falls back to its position, deterministically", () => {
    // Nothing left after the punctuation goes: a number, so the address is
    // stable for as long as the item stays where it is in the file.
    const collection = titled("Take Five", "…", "!?");
    expect(collection.items.map((i) => i.slug)).toEqual(["take-five", "item-2", "item-3"]);
  });

  test("two works of the same name are -1 and -2, in the order the file lists them", () => {
    const collection = titled("Anna", "Anna", "Anna");
    expect(collection.items.map((i) => i.slug)).toEqual(["anna", "anna-1", "anna-2"]);
    expect(collection.bySlug.get("anna-2")!.title).toBe("Anna");
  });

  test("a slug the file states is used, and one that isn't a slug is said so and cleaned", () => {
    const collection = parseCollection("works", json({
      groups: [group("all", [{ title: "Anything", slug: "the-name-i-want" }, { title: "Other", slug: 'l"etoile' }])],
    }));
    expect(collection.items[0]!.slug).toBe("the-name-i-want");
    expect(collection.items[1]!.slug).toBe("l-etoile");
    expect(collection.problems[0]).toContain(`slug "l"etoile" isn't [a-z0-9-]`);
  });
});

describe("fragmentId", () => {
  test("a value that can be a fragment is left alone, so a template's href matches the heading", () => {
    expect(fragmentId("1967")).toBe("1967");    // a year: the same either way
    expect(fragmentId("London")).toBe("London");
    expect(fragmentId("Works on Paper")).toBe("works-on-paper");
    expect(fragmentId("…")).toBe("x");
  });
});

describe("aliasKey", () => {
  test("the one form an old address is compared in", () => {
    expect(aliasKey("/first-light")).toBe("/first-light");
    expect(aliasKey("first-light/")).toBe("/first-light");
    expect(aliasKey("/first-light.html")).toBe("/first-light");
    expect(aliasKey("/")).toBe("/");
    // Whatever the old site put in a URL survives, because it is compared
    // decoded and never re-encoded on the way in.
    expect(aliasKey(`/l"etoile-1976`)).toBe(`/l"etoile-1976`);
  });
});

describe("images", () => {
  test("a base URL, and a thumbnail named by a rule rather than one by one", () => {
    const collection = parseCollection("works", json({
      images: "https://pictures.example/original/",
      groups: [group("all", [{ title: "Large Car Painting", src: "Large Car Painting.jpeg" }])],
    }));
    const item = collection.items[0]!;
    expect(item.src).toBe("https://pictures.example/original/Large%20Car%20Painting.jpeg");
    expect(item.thumb).toBe("https://pictures.example/original/Large%20Car%20Painting_tn.jpeg");
  });

  test("thumbnails may live somewhere else and be a different format", () => {
    const collection = parseCollection("works", json({
      images: { src: "https://pictures.example/original", thumb: "https://pictures.example/thumbnails", extension: ".png" },
      groups: [group("all", [{ title: "Anna", src: "Anna.jpg" }])],
    }));
    const item = collection.items[0]!;
    expect(item.src).toBe("https://pictures.example/original/Anna.jpg");
    expect(item.thumb).toBe("https://pictures.example/thumbnails/Anna_tn.png");
  });

  test("without an images setting they resolve under the site's own static/images/", () => {
    const item = parseCollection("works", json({ groups: [group("all", [{ title: "Anna", src: "Anna.jpg" }])] })).items[0]!;
    expect(item.src).toBe("/static/images/Anna.jpg");
    expect(item.thumb).toBe("/static/images/Anna_tn.jpg");
  });

  test("an item with no picture has no src and no thumbnail, rather than a link to the folder", () => {
    const item = parseCollection("works", json({ groups: [group("all", [{ title: "Anna" }])] })).items[0]!;
    expect(item.src).toBe("");
    expect(item.thumb).toBe("");
  });

  test("the suffix goes before the extension, and a name without one still gets it", () => {
    const rule = { src: "", thumb: "", suffix: "_tn", extension: "" };
    expect(thumbName("a/b.jpg", rule)).toBe("a/b_tn.jpg");
    expect(thumbName("plain", rule)).toBe("plain_tn");
    expect(thumbName("a.folder/plain", rule)).toBe("a.folder/plain_tn");
  });

  test("an images setting that is neither a URL nor an object is said so and the default is used", () => {
    const collection = parseCollection("works", json({ images: 42, groups: [] }));
    expect(collection.images.src).toBe("/static/images/");
    expect(collection.problems[0]).toContain('"images" should be a base URL or an object');
  });
});

describe("parseCollection", () => {
  test("a file that isn't JSON, or isn't an object, is a problem rather than a crash", () => {
    expect(parseCollection("works", "{oops").problems[0]).toContain("works/collection.json:");
    expect(parseCollection("works", "[]").problems[0]).toBe("works/collection.json: not an object");
    expect(parseCollection("works", "{oops").items).toEqual([]);
  });

  test("groups, subgroups and items, flattened into the one order prev/next runs in", () => {
    const collection = parseCollection("works", json({
      groups: [
        group("1960", [{ title: "Battersea" }], {
          label: "1960-1969",
          groups: [group("London", [{ title: "Take Five" }])],
        }),
        group("1970", [{ title: "Rushes" }]),
      ],
    }));
    expect(collection.items.map((i) => i.title)).toEqual(["Battersea", "Take Five", "Rushes"]);
    expect(collection.groups[0]!.label).toBe("1960-1969");
    expect(collection.groups[1]!.label).toBe("1970");           // no label: the name does
    expect(collection.items[1]!.group.name).toBe("London");     // the innermost one
    expect(collection.items[0]!.href).toBe("/works/battersea/");
    expect(collection.items[0]!.key).toBe("works/battersea/index.md");
  });

  test("two subgroups of the same name get ids of their own, because names are not unique", () => {
    // 1960 and 1970 each have a group called London; two id="London" in one
    // document is one anchor that works and one that doesn't.
    const collection = parseCollection("works", json({
      groups: [
        group("1960", [], { groups: [group("London", [{ title: "A" }])] }),
        group("1970", [], { groups: [group("London", [{ title: "B" }])] }),
      ],
    }));
    const ids = [collection.groups[0]!.groups[0]!.id, collection.groups[1]!.groups[0]!.id];
    expect(ids).toEqual(["London", "London-1"]);
  });

  test("a collection at the site root has no folder in its addresses", () => {
    const collection = parseCollection("", json({ groups: [group("all", [{ title: "Anna" }])] }));
    expect(collection.items[0]!.href).toBe("/anna/");
    expect(collectionPath("")).toBe("collection.json");
  });

  test("anything the file isn't shaped like is skipped rather than believed", () => {
    const collection = parseCollection("works", json({
      layout: 7, labels: "no", groups: [group("all", ["not an object", { title: "Anna", aliases: "not a list" }]), "nope"],
    }));
    expect(collection.layout).toBe("item");
    expect(collection.labels).toEqual({});
    expect(collection.items).toHaveLength(1);
    expect(collection.items[0]!.aliases).toEqual([]);
  });

  test("labels that aren't a map of strings are left out", () => {
    const collection = parseCollection("works", json({ labels: { year: { "1967": "California", "1968": [] }, bad: 3 } }));
    expect(collection.labels).toEqual({ year: { "1967": "California" } });
  });

  test("an item's fields are whatever it says, numbers included, and aliases are not one", () => {
    const item = parseCollection("works", json({
      groups: [group("all", [{ title: "Anna", index: 1967, prints: "skip", aliases: ["/anna-1967"], junk: {} }])],
    })).items[0]!;
    expect(item.fields).toEqual({ title: "Anna", index: "1967", prints: "skip", slug: "anna" });
    expect(item.aliases).toEqual(["/anna-1967"]);
  });
});

describe("itemsHtml", () => {
  const site = () => parseCollection("works", json({
    labels: { index: { "1967": "California" } },
    groups: [
      group("1960", [{ title: "Battersea", src: "b.jpg", index: "1962" }], {
        label: "1960-1969",
        groups: [group("London", [{ title: "Take Five", src: "t.jpg", index: "1967" }])],
      }),
      group("prints", [{ title: "Rushes", src: "r.jpg", index: "skip" }]),
    ],
  }));

  test("the groups in order, each a grid of thumbnails linking to the item pages", () => {
    const html = itemsHtml(site());
    expect(html).toContain('<section class="group" id="1960">');
    expect(html).toContain("<h2>1960-1969</h2>");
    expect(html).toContain('<h3>London</h3>');                    // a subgroup, one level down
    expect(html).toContain('<a class="item" href="/works/battersea/">');
    expect(html).toContain('<img class="thumb" src="/static/images/b_tn.jpg" alt="Battersea" loading="lazy">');
  });

  test("by a field: one grid per value, in the order the values first appear, and skip means skip", () => {
    const html = itemsHtml(site(), "index");
    expect(html.match(/<section class="group" id="([^"]+)">/g)).toEqual([
      '<section class="group" id="1962">', '<section class="group" id="1967">',
    ]);
    expect(html).toContain("<h2>1967 - California</h2>");         // the label, after the value
    expect(html).not.toContain("Rushes");                         // index: skip
  });

  test("sort=asc or desc orders the groups by value: years as numbers, the rest as words", () => {
    const ids = (html: string) => [...html.matchAll(/<section class="group" id="([^"]+)">/g)].map((m) => m[1]);
    expect(ids(itemsHtml(site(), "index", "asc"))).toEqual(["1962", "1967"]);
    expect(ids(itemsHtml(site(), "index", "desc"))).toEqual(["1967", "1962"]);
    expect(ids(itemsHtml(site(), "index", "sideways"))).toEqual(ids(itemsHtml(site(), "index")));  // not a sort: file order
    expect(sortValues(["1990", "2026", "1960"], "asc")).toEqual(["1960", "1990", "2026"]);
    expect(sortValues(["10", "9", "100"], "asc")).toEqual(["9", "10", "100"]);        // numbers, not strings
    expect(sortValues(["b", "10", "a"], "desc")).toEqual(["b", "a", "10"]);           // one word makes it words
    expect(sortValues(["b", "a"])).toEqual(["b", "a"]);
  });

  test("nothing to show is nothing at all, not an empty grid", () => {
    const empty = parseCollection("works", json({ groups: [group("1960", [])] }));
    expect(itemsHtml(empty)).toBe("");
    expect(itemsHtml(empty, "index")).toBe("");
    expect(groupsHtml(empty)).toContain("<span>1960</span>");     // a group with no item links nowhere
    expect(groupsHtml(parseCollection("works", "{}"))).toBe("");
  });

  test("a title with markup in it is escaped, here as everywhere", () => {
    const html = itemsHtml(parseCollection("works", json({ groups: [group("all", [{ title: "<b>&</b>", src: "a.jpg" }])] })));
    expect(html).toContain("&lt;b&gt;&amp;&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });
});

describe("groupsHtml", () => {
  const site = () => parseCollection("works", json({
    groups: [
      group("1960", [{ title: "Battersea" }], { groups: [group("London", [{ title: "Take Five" }])] }),
      group("prints", [{ title: "Rushes" }]),
    ],
  }));

  test("each group links to its first item, and the one being read is marked", () => {
    const collection = site();
    const html = groupsHtml(collection, collection.items[1]!.group);
    expect(html).toContain('<a href="/works/battersea/">1960</a>');
    expect(html).toContain('<a href="/works/take-five/" aria-current="true">London</a>');
    expect(html).toContain('<a href="/works/rushes/">prints</a>');
  });

  test("with nothing being read, nothing is marked", () => {
    expect(groupsHtml(site())).not.toContain("aria-current");
  });
});

describe("prev and next", () => {
  const site = () => parseCollection("works", json({ groups: [group("all", [{ title: "A" }, { title: "B" }, { title: "C" }])] }));

  test("the collection is a ring: the last work's next is the first", () => {
    const collection = site();
    const [a, b, c] = collection.items;
    expect(neighbour(collection, a!, -1)).toBe(c!);
    expect(neighbour(collection, c!, 1)).toBe(a!);
    expect(neighbour(collection, b!, 1)).toBe(c!);
  });

  test("one work on its own has no neighbours, and neither has an item from elsewhere", () => {
    const one = parseCollection("works", json({ groups: [group("all", [{ title: "A" }])] }));
    expect(neighbour(one, one.items[0]!, 1)).toBeNull();
    expect(neighbour(site(), one.items[0]!, 1)).toBeNull();
  });
});

describe("itemValue", () => {
  const collection = parseCollection("works", json({
    images: "/pics/",
    groups: [group("1960", [{ title: "Battersea", src: "b.jpg", caption: "Ink", index: "1962" }, { title: "Second", index: "skip" }])],
  }));
  const context = { collection, item: collection.items[0]! };

  test("anything the item says, by name, escaped and empty when unset", () => {
    expect(itemValue("item-title", context)).toBe("Battersea");
    expect(itemValue("item-index", context)).toBe("1962");   // what a template writes as href="/works/#1962"
    expect(itemValue("item-caption", context)).toBe("Ink");
    expect(itemValue("item-src", context)).toBe("/pics/b.jpg");
    expect(itemValue("item-thumb", context)).toBe("/pics/b_tn.jpg");
    expect(itemValue("item-href", context)).toBe("/works/battersea/");
    expect(itemValue("item-nonsense", context)).toBe("");
    // "skip" is duckdown's word, not the site's: it keeps an item out of an
    // overview, so a template linking href="/works/#{{item-index}}" must land
    // at the top of the overview rather than at an anchor called #skip.
    expect(itemValue("item-index", { collection, item: collection.items[1]! })).toBe("");
    expect(itemValue("group", context)).toBe("1960");
    expect(itemValue("prev", context)).toContain('href="/works/second/"');
    expect(itemValue("next", context)).toContain('class="next"');
  });

  test("on a page that is not an item every one of them is empty", () => {
    for (const name of ["item-title", "prev", "next", "group"]) expect(itemValue(name)).toBe("");
  });
});

describe("parseArgs", () => {
  test("a bare word names the collection, key=value is an option", () => {
    expect(parseArgs("")).toEqual({ name: undefined, options: {} });
    expect(parseArgs(" works ")).toEqual({ name: "works", options: {} });
    expect(parseArgs(" by=index")).toEqual({ name: undefined, options: { by: "index" } });
    expect(parseArgs(" works by=prints extra")).toEqual({ name: "works", options: { by: "prints" } });
  });
});

describe("fillCollections", () => {
  const pages = () => memory({
    "works/collection.json": json({ groups: [group("1960", [{ title: "Battersea", index: "1962" }])] }),
  });

  test("a tag names another folder's collection, so an overview can live outside it", async () => {
    const html = await fillCollections("<p>{{items works by=index}}</p>", { pages: pages(), folder: "", debug: true });
    expect(html).toContain('<section class="group" id="1962">');
    expect(html).not.toContain("<p><div");   // the wrapping paragraph goes with it
    const sorted = await fillCollections("{{items works by=index sort=desc}}", { pages: pages(), folder: "", debug: true });
    expect(sorted.indexOf('id="1967"')).toBeLessThan(sorted.indexOf('id="1962"'));
  });

  test("with no name it is the page's own folder's collection", async () => {
    expect(await fillCollections("{{groups}}", { pages: pages(), folder: "works", debug: true })).toContain("1960");
  });

  test("a tag inside <code> is printed, not expanded, so the guide can show one", async () => {
    const html = await fillCollections("<code>{{items}}</code>", { pages: pages(), folder: "works", debug: true });
    expect(html).toBe("<code>{{items}}</code>");
  });

  test("html with no tag in it is handed straight back", async () => {
    expect(await fillCollections("plain", { pages: pages(), folder: "works" })).toBe("plain");
    expect(await fillCollections("{{nav}}", { pages: pages(), folder: "works" })).toBe("{{nav}}");
  });

  test("a tag naming a folder with no collection is filled as nothing, and says so", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const html = await fillCollections("{{items nowhere}}", { pages: pages(), folder: "", debug: true });
      expect(html).toBe("");
      expect(log.mock.calls[0]![0]).toContain("there is no nowhere/collection.json");
    } finally {
      log.mockRestore();
    }
  });
});

describe("loadCollection", () => {
  test("read once and kept, until a write says otherwise", async () => {
    const files = { "works/collection.json": json({ groups: [group("all", [{ title: "A" }])] }) };
    const store = memory(files);
    const reads = spyOn(store, "read");
    expect((await loadCollection(store, "works", false))!.items).toHaveLength(1);
    files["works/collection.json"] = json({ groups: [group("all", [{ title: "A" }, { title: "B" }])] });
    expect((await loadCollection(store, "works", false))!.items).toHaveLength(1);   // still the kept one
    expect(reads).toHaveBeenCalledTimes(1);
    collectionsChanged();
    expect((await loadCollection(store, "works", false))!.items).toHaveLength(2);
  });

  test("a folder with no collection.json is null, and asked again rather than remembered wrong", async () => {
    expect(await loadCollection(memory({}), "works", true)).toBeNull();
  });

  test("a build that fails isn't kept: the next request tries again", async () => {
    collectionsChanged();
    const store = memory({ "works/collection.json": "{}" });
    const read = spyOn(store, "read").mockImplementation(async () => { throw new Error("storage is down"); });
    await expect(loadCollection(store, "works", false)).rejects.toThrow("storage is down");
    read.mockRestore();
    expect(await loadCollection(store, "works", false)).not.toBeNull();
    collectionsChanged();
  });

  test("what is wrong with the file is logged as well as carried", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const collection = await loadCollection(memory({ "works/collection.json": "{oops" }), "works", true);
      expect(collection!.problems).toHaveLength(1);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

describe("itemAt", () => {
  const pages = () => memory({
    "works/collection.json": json({ groups: [group("all", [{ title: "Battersea" }])] }),
  });

  test("the folder and the slug the address names, and nothing like them", async () => {
    expect((await itemAt(pages(), "works/battersea", true))!.item.title).toBe("Battersea");
    // A miss is a miss. Never a nearest match, never the first item of the
    // collection: that fallback is what served the wrong painting for years.
    expect(await itemAt(pages(), "works/battersee", true)).toBeNull();
    expect(await itemAt(pages(), "elsewhere/battersea", true)).toBeNull();
    expect(await itemAt(pages(), "battersea", true)).toBeNull();
    expect(await itemAt(pages(), "works/", true)).toBeNull();
  });
});

describe("collisions", () => {
  test("an item whose address is already a page is said, because the page wins silently", async () => {
    const store = memory({
      "works/collection.json": "{}",
      "works/about.md": "title: About",
      "works/archive/index.md": "title: Archive",
    });
    const collection = parseCollection("works", json({
      groups: [group("all", [{ title: "About" }, { title: "Archive" }, { title: "Fine" }])],
    }));
    const said = await collisions(store, collection);
    expect(said).toHaveLength(2);
    expect(said[0]).toContain("works/collection.json: \"About\" wants /works/about/");
    expect(said.join(" ")).not.toContain("Fine");
  });

  test("a collection with no items asks the storage nothing", async () => {
    const store = memory({});
    const list = spyOn(store, "list");
    expect(await collisions(store, parseCollection("works", "{}"))).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  test("collectionProblems is the file's own problems and the addresses it can't have", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const store = memory({
        "works/collection.json": json({ groups: [group("all", [{ title: "About", slug: "About" }])] }),
        "works/about.md": "x",
      });
      expect(await collectionProblems(store, "works", true)).toHaveLength(2);
      expect(await collectionProblems(store, "elsewhere", true)).toEqual([]);
    } finally {
      log.mockRestore();
    }
  });
});
