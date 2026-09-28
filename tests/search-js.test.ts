// The browser half of search: the real search.js, in happy-dom, against an index
// we stage. Nothing here is duckdown's server; it is the script a site serves.
// The index's files are made from the entries by searchFiles(), the one thing
// of the server's it uses, so the two halves can't disagree about the format.
import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { waitFor } from "./helpers";
import { searchFiles, searchFile, type Entry } from "../server/search";

const script = readFileSync(join(import.meta.dir, "..", "server", "base", "search.js"), "utf8");
const entry = (e: Partial<Entry>): Entry => ({ url: "/", title: "", section: "", description: "", date: "", text: "", ...e });

const realFetch = globalThis.fetch;
let form: HTMLFormElement;
let asked: string[] = [];

// A page with the seed template's search form, and search.js started on it,
// answering from `index` as the served site and the export both would, and
// noting each address it asks for. `hold` keeps a file's answer back until
// the promise it names settles.
function start(index: Entry[], hold: Record<string, Promise<unknown>> = {}) {
  const files = searchFiles(index);
  asked = [];
  globalThis.fetch = (async (url: string) => {
    asked.push(url);
    await hold[url];
    const body = searchFile(files, url);
    return body === null ? new Response("Not Found", { status: 404 }) : new Response(body);
  }) as unknown as typeof fetch;
  document.body.innerHTML = `<form class="search" role="search">
    <button type="button" class="search-toggle" aria-expanded="false"></button>
    <div class="search-panel"><input type="search"><div class="search-results"></div></div>
  </form><p id="elsewhere">page</p>`;
  form = document.querySelector("form")!;
  (0, eval)(script);
}
beforeEach(() => void (form = null as never));
afterEach(() => {
  globalThis.fetch = realFetch;
  location.hash = "";
  delete (window as any).scrollY;
  delete (document as any).readyState;
});

function type(query: string): void {
  if (!form.hasAttribute("data-open")) (form.querySelector(".search-toggle") as HTMLElement).click();
  const input = form.querySelector("input")!;
  input.value = query;
  input.dispatchEvent(new Event("input"));
}
// What a search shows, once it has shown it: the results are busy while it fetches.
async function search(query: string): Promise<HTMLAnchorElement[]> {
  type(query);
  const results = form.querySelector(".search-results")!;
  await waitFor(() => !results.hasAttribute("aria-busy") && results.children.length > 0);
  return [...form.querySelectorAll<HTMLAnchorElement>(".search-results a")];
}
const hrefs = (links: HTMLAnchorElement[]) => links.map((a) => a.getAttribute("href"));

describe("search.js", () => {
  test("a section is 'Page – Section', linked at its #id and to the words, from the start of the word", async () => {
    start([entry({ url: "/jadd/#train-song", title: "Jadd", section: "Train song", text: "Written in a Train Station one morning, and sung since" })]);
    const [link] = await search("station");
    expect(link!.textContent).toBe("Jadd – Train song");
    // Original case, five words, encoded; the fragment begins at "Station"'s own word.
    expect(link!.getAttribute("href")).toBe("/jadd/#train-song:~:text=Station%20one%20morning%2C%20and%20sung");
  });

  test("a bare dash is fragment syntax, so it is encoded, as are , and &", async () => {
    start([entry({ url: "/a.html#x", title: "A", section: "X", text: "tree-lined, salt & pepper" })]);
    const [link] = await search("tree");
    expect(link!.getAttribute("href")).toBe("/a.html#x:~:text=tree%2Dlined%2C%20salt%20%26%20pepper");
  });

  test("a page's own entry, with no id, links '#:~:text='", async () => {
    start([entry({ url: "/about.html", title: "About", text: "we make small things" })]);
    const [link] = await search("small");
    expect(link!.textContent).toBe("About");
    expect(link!.getAttribute("href")).toBe("/about.html#:~:text=small%20things");
  });

  test("a word only in the heading has nowhere to point but the heading; and a section named for its page is the page's name", async () => {
    start([
      entry({ url: "/a.html#songs", title: "Album", section: "Songs", text: "twenty of them" }),
      entry({ url: "/a.html#album", title: "Album", section: "Album", text: "intro" }),
    ]);
    const links = await search("songs");
    expect(hrefs(links)).toEqual(["/a.html#songs"]);
    const [same] = await search("intro");
    expect(same!.textContent).toBe("Album");   // not "Album – Album"
  });

  test("a word in a section's heading outranks the same word in another's text", async () => {
    start([
      entry({ url: "/a.html#one", title: "A", section: "One", text: "a train passes" }),
      entry({ url: "/a.html#two", title: "A", section: "Train song", text: "words" }),
    ]);
    expect(hrefs(await search("train"))).toEqual(["/a.html#two", "/a.html#one:~:text=train%20passes"]);
  });

  test("no page fills the list: three sections of it at most, best first, then the others", async () => {
    const long = Array.from({ length: 6 }, (_, i) => entry({ url: `/long.html#s${i}`, title: "Long", section: `S${i}`, text: "a train" }));
    start([...long, entry({ url: "/short.html", title: "Short", text: "another train" })]);
    const found = hrefs(await search("train"));
    expect(found.filter((h) => h!.startsWith("/long.html"))).toHaveLength(3);
    expect(found.some((h) => h!.startsWith("/short.html"))).toBe(true);
  });

  test("following a result closes the panel, once the click has done its work", async () => {
    start([entry({ url: "/a.html#x", title: "A", section: "X", text: "train" })]);
    const [link] = await search("train");
    expect(form.hasAttribute("data-open")).toBe(true);
    link!.addEventListener("click", (e) => e.preventDefault());   // no navigating in a test
    link!.click();
    expect(form.hasAttribute("data-open")).toBe(true);            // not yet: the link is still in the page
    await waitFor(() => !form.hasAttribute("data-open"));
    expect(form.querySelector(".search-results")!.innerHTML).toBe("");
  });

  test("a click that isn't on a result leaves the panel alone", async () => {
    start([entry({ url: "/a.html", title: "A", text: "train" })]);
    await search("train");
    form.querySelector(".search-results ul")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Bun.sleep(5);
    expect(form.hasAttribute("data-open")).toBe(true);
  });
});

describe("search.js, on a word's start", () => {
  test("a word is found where it starts, in the body as in the title, and not inside another", async () => {
    start([
      entry({ url: "/reviews.html#bbc", title: "Reviews", section: "BBC", text: "the constraints of domesticity, and some restraint" }),
      entry({ url: "/jadd.html#train", title: "Jadd", section: "Train song", text: "wheels beating" }),
      entry({ url: "/notes.html", title: "Notes", description: "a trainspotter's diary", text: "" }),
      entry({ url: "/other.html", title: "Other", text: "the last Train home" }),
    ]);
    const found = hrefs(await search("train"));
    expect(found).not.toContain(expect.stringContaining("/reviews.html"));       // "constraints" and "restraint" only contain it
    expect(found[0]).toBe("/jadd.html#train");                                    // the heading first
    expect(found).toContain("/notes.html");                                       // "trainspotter" starts with it
    expect(found).toContain("/other.html#:~:text=Train%20home");                  // and the fragment starts at that word
  });
});

// n166: the whole index was 68 MB at 20,000 pages, all of it fetched before a
// reader's first result. Now a search fetches what it needs.
describe("search.js, fetching what a search needs", () => {
  const pages = Array.from({ length: 40 }, (_, n) => [
    entry({ url: `/p${n}.html`, title: `Page ${n}`, description: n % 2 ? "an odd one" : "" }),
    entry({ url: `/p${n}.html#s`, title: `Page ${n}`, section: n === 7 ? "Train song" : "Words", text: `a quick brown fox ${n === 30 ? "and a train" : ""}` }),
  ]).flat();

  test("which words there are, the shard of each word asked for, and the pages it shows: never the whole index", async () => {
    start(pages);
    const found = await search("train");
    expect(hrefs(found)).toEqual(["/p7.html#s", "/p30.html#s:~:text=train"]);   // the heading first, as ever
    expect(asked).toEqual(["/search/index.json", "/search/words/tr.json", "/search/pages/7.json", "/search/pages/30.json"]);
    expect(asked).not.toContain("/search.json");
    // What it has, it keeps: another word of the same shard, and a page already shown, cost nothing more.
    await search("trai");
    expect(asked).toHaveLength(4);
  });

  test("eight results at most, three of a page, and only their pages fetched however many match", async () => {
    start(pages);
    const found = await search("fox");
    expect(found).toHaveLength(8);
    expect(asked.filter((a) => a.startsWith("/search/pages/"))).toEqual(
      ["/search/pages/0.json", "/search/pages/1.json", "/search/pages/2.json", "/search/pages/3.json",
        "/search/pages/4.json", "/search/pages/5.json", "/search/pages/6.json", "/search/pages/7.json"]);
  });

  test("every word must be somewhere, and each word's best place counts: title, then heading, description, text", async () => {
    start(pages);
    // "odd" is in the odd pages' descriptions; "page" in every title; "fox" in every section's text.
    expect(hrefs(await search("odd page"))).toEqual(["/p1.html", "/p3.html", "/p5.html", "/p7.html", "/p9.html", "/p11.html", "/p13.html", "/p15.html"]);
    expect(hrefs(await search("odd fox"))).toEqual([]);   // no one entry has both: the one is on the page's, the other in its section
    expect(form.querySelector(".search-none")!.textContent).toBe("Nothing matches “odd fox”.");
  });

  test("a word of one letter is a whole word, so 'page 3' is page 3 and not 30", async () => {
    start(pages);
    expect((await search("page 3")).map((a) => a.textContent)).toEqual(["Page 3", "Page 3 – Words"]);
    expect(asked).toContain("/search/words/3.json");   // the words that are just "3", and no other
  });

  test("the query's words are cut as the index cuts a page's: at anything but a letter or a digit, accents and all", async () => {
    start([
      entry({ url: "/a.html", title: "Café society", text: "tree-lined streets" }),
      entry({ url: "/b.html", title: "Über alles", text: "naïve art" }),
    ]);
    expect(hrefs(await search("tree-lined"))).toEqual(["/a.html#:~:text=tree%2Dlined%20streets"]);
    expect(hrefs(await search("CAFÉ"))).toEqual(["/a.html"]);
    expect(hrefs(await search("über"))).toEqual(["/b.html"]);   // a word may start with a letter that isn't a-z
    expect(asked).toContain("/search/words/_fc_b.json");        // spelt as its code point in the file's name
    expect(hrefs(await search("naïve"))).toEqual(["/b.html#:~:text=na%C3%AFve%20art"]);
    expect(hrefs(await search("ve"))).toEqual([]);               // "naïve" is one word, not "na" and "ve"
    expect(hrefs(await search("—"))).toEqual([]);                // nothing to look for
  });

  test("a slow answer to an earlier keystroke doesn't replace a later one's", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    start(pages, { "/search/words/fo.json": slow });
    type("fox");
    expect(form.querySelector(".search-results")!.getAttribute("aria-busy")).toBe("true");   // said while it fetches
    const found = await search("train");
    expect(hrefs(found)).toEqual(["/p7.html#s", "/p30.html#s:~:text=train"]);
    release();
    await Bun.sleep(10);
    expect(hrefs([...form.querySelectorAll<HTMLAnchorElement>(".search-results a")])).toEqual(hrefs(found));
  });

  test("a file that isn't there, or won't come, is nothing found rather than a failure, and the console says which", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    start(pages);
    globalThis.fetch = (async (url: string) => {
      asked.push(url);
      if (url === "/search/index.json") return new Response(JSON.stringify({ words: ["tr", "fo"] }));
      if (url === "/search/words/fo.json") throw new TypeError("offline");
      return new Response("Not Found", { status: 404 });
    }) as unknown as typeof fetch;
    expect(hrefs(await search("train"))).toEqual([]);
    expect(hrefs(await search("fox"))).toEqual([]);
    expect(hrefs(await search("zebra"))).toEqual([]);            // no such shard: not asked for at all
    expect(asked).not.toContain("/search/words/ze.json");
    expect(warn.mock.calls.map((c) => c.slice(0, 2))).toEqual([["search.js: couldn't fetch", "/search/words/fo.json"]]);
    warn.mockRestore();
  });

  test("a result whose section the page no longer has is left out", async () => {
    start(pages);
    const files = searchFiles(pages);
    globalThis.fetch = (async (url: string) =>
      new Response(url === "/search/pages/7.json" ? "[]" : searchFile(files, url))) as unknown as typeof fetch;
    expect(hrefs(await search("train"))).toEqual(["/p30.html#s:~:text=train"]);
  });
});

describe("search.js, arriving at a result", () => {
  // The page loads at `hash` with the reader at `y`; the heading is `top` pixels
  // down the window. Did the script scroll it into view?
  function arrival(o: { hash?: string; y?: number; top?: number; present?: boolean; loading?: boolean }): boolean {
    location.hash = o.hash ?? "#train-song";
    Object.defineProperty(window, "scrollY", { value: o.y ?? 0, configurable: true });
    document.body.innerHTML = o.present === false ? "<p>nothing</p>" : '<h2 id="train-song">Train song</h2>';
    let scrolled = false;
    const heading = document.getElementById("train-song");
    if (heading) {
      heading.getBoundingClientRect = () => ({ top: o.top ?? 3000 }) as DOMRect;
      heading.scrollIntoView = () => void (scrolled = true);
    }
    if (o.loading) Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
    (0, eval)(script);
    if (o.loading) {
      expect(scrolled).toBe(false);                    // not until the images are in and the heading has stopped moving
      window.dispatchEvent(new Event("load"));
    }
    return scrolled;
  }

  test("scrolls to the heading when the browser hasn't, even on a page with no search form", () => {
    expect(arrival({})).toBe(true);
  });

  test("waits for the page to load when it hasn't yet", () => {
    expect(arrival({ loading: true })).toBe(true);
  });

  test("does nothing when the page has already scrolled (the text fragment worked), or the heading is in view, or there is no hash", () => {
    expect(arrival({ y: 3042 })).toBe(false);
    expect(arrival({ top: 16 })).toBe(false);
    expect(arrival({ hash: "" })).toBe(false);
  });

  test("scrolls up to a heading above the window too", () => {
    expect(arrival({ top: -400 })).toBe(true);
  });

  test("does nothing for an id that isn't on the page, and says so for one that won't decode", () => {
    expect(arrival({ present: false })).toBe(false);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(arrival({ hash: "#%E0%A4%A" })).toBe(false);
      expect(String(warn.mock.calls[0]![0])).toContain("won't decode");
    } finally {
      warn.mockRestore();
    }
  });
});
