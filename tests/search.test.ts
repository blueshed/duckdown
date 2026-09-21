// The index a reader searches: built here, matched in the browser.
import { describe, test, expect } from "bun:test";
import type { Storage, Listing } from "../server/storage";
import { plainText, buildIndex, searchIndex, searchChanged } from "../server/search";

// An in-memory Storage over { "guide/index.md": "…" }; read() throws for `broken`.
function memory(files: Record<string, string>, broken = ""): Storage {
  return {
    async list(prefix) {
      const dir = prefix ? `${prefix}/` : "";
      const out: Listing = { files: [], folders: [] };
      for (const key of Object.keys(files).filter((k) => k.startsWith(dir))) {
        const rest = key.slice(dir.length);
        const name = rest.split("/")[0]!;
        if (rest === name) out.files.push({ name, path: `/${key}`, file: true, size: 0, type: "text/markdown" });
        else if (!out.folders.some((f) => f.name === name)) out.folders.push({ name, path: `/${dir}${name}`, file: false });
      }
      return out;
    },
    async read(key) {
      if (key === broken) throw new Error("storage is down");
      return files[key]!;
    },
    async readBytes(key) { return new TextEncoder().encode(files[key]); },
    async write(key, body) { files[key] = String(body); },
    async remove(key) { delete files[key]; },
    async exists(key) { return key in files; },
    mime: () => "text/plain",
  };
}

describe("plainText", () => {
  test("keeps the words and drops the marks", () => {
    expect(plainText("## A heading\n\nSome **bold** and *italic* and ~~gone~~.")).
      toBe("A heading Some bold and italic and gone.");
    expect(plainText("> a quote\n> over two lines")).toBe("a quote over two lines");
    expect(plainText("- one\n- two")).toBe("one two");
  });

  test("a link keeps its label, an image keeps nothing", () => {
    expect(plainText("see [the guide](/guide/) now")).toBe("see the guide now");
    expect(plainText("![a duck](/static/duck.svg) after")).toBe("after");
    expect(plainText("[[themes]] and [[themes|the guide]] and [[pages#callouts]]")).
      toBe("themes and the guide and pages");
  });

  test("code is punctuation, and punctuation is not what anyone searches for", () => {
    expect(plainText("before\n\n```js\nconst x = () => 1;\n```\n\nafter")).toBe("before after");
    expect(plainText("before\n\n~~~\nraw\n~~~\n\nafter")).toBe("before after");
    expect(plainText("an `inline` one")).toBe("an inline one");
    expect(plainText("<span class='x'>tagged</span> text")).toBe("tagged text");
    expect(plainText("| a | b |\n|---|---|\n| 1 | 2 |\n\nafter")).toBe("after");
    expect(plainText("> [!TIP]\n> press it")).toBe("press it");
  });
});

describe("buildIndex", () => {
  const site = () => memory({
    "index.md": "title: Home\ndescription: The front door\n\n# Home\n\nWelcome in.",
    "no-title.md": "# Untitled\n\nnothing declared",
    "draft.md": "title: Later\ndraft: true\n\n# Later\n\nnot yet",
    "notes.txt": "not a page",
    "guide/index.md": "title: Guide\n\n# Guide\n\nHow to use it.",
    "guide/deep/page.md": "title: Deep\n\n# Deep\n\nFurther in.",
    ".hidden/page.md": "title: Hidden\n\n# Hidden",
  });

  test("one entry per page a reader could reach, at its canonical address", async () => {
    const entries = await buildIndex(site());
    const urls = entries.map((e) => e.url);

    expect(urls).toContain("/");                    // index.md
    expect(urls).toContain("/guide/");              // a folder is its index
    expect(urls).toContain("/guide/deep/page.html");
    expect(urls).not.toContain("/draft.html");      // 404 to a reader
    expect(entries.some((e) => e.url.includes("notes"))).toBe(false);   // not a page
    expect(entries.some((e) => e.title === "Hidden")).toBe(false);      // a . folder

    const home = entries.find((e) => e.url === "/")!;
    expect(home.title).toBe("Home");
    expect(home.description).toBe("The front door");
    expect(home.text).toBe("Home Welcome in.");
  });

  test("a page with no title: is named by its file, and needs no description", async () => {
    const entry = (await buildIndex(site())).find((e) => e.url === "/no-title.html")!;
    expect(entry.title).toBe("no-title");
    expect(entry.description).toBe("");
  });
});

describe("searchIndex", () => {
  test("built once and kept, until a page changes", async () => {
    const pages = memory({ "index.md": "title: One\n\nfirst" });
    const first = await searchIndex(pages, false);
    await pages.write("index.md", "title: Two\n\nsecond");

    expect((await searchIndex(pages, false))[0]!.title).toBe("One");   // the kept one
    searchChanged();
    expect((await searchIndex(pages, false))[0]!.title).toBe("Two");
    searchChanged();
  });

  test("built per request in development, where pages are written straight to disk", async () => {
    const pages = memory({ "index.md": "title: One\n\nfirst" });
    await searchIndex(pages, true);
    await pages.write("index.md", "title: Two\n\nsecond");
    expect((await searchIndex(pages, true))[0]!.title).toBe("Two");
  });

  test("a build that fails isn't kept: the next request tries again", async () => {
    const pages = memory({ "index.md": "title: One\n\nfirst" }, "index.md");
    expect(searchIndex(pages, false)).rejects.toThrow("storage is down");
    await Bun.sleep(1);
    // The same storage, no longer broken — it would answer from the failure if
    // the failure had been cached.
    expect((await searchIndex(memory({ "index.md": "title: Two\n\nsecond" }), false))[0]!.title).toBe("Two");
    searchChanged();
  });
});
