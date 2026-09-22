// The browser half of search: the real search.js, in happy-dom, against an index
// we stage. Nothing here is duckdown's server; it is the script a site serves.
import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { waitFor } from "./helpers";

const script = readFileSync(join(import.meta.dir, "..", "server", "base", "search.js"), "utf8");
type Entry = { url: string; title: string; section: string; description: string; date: string; text: string };
const entry = (e: Partial<Entry>): Entry => ({ url: "/", title: "", section: "", description: "", date: "", text: "", ...e });

const realFetch = globalThis.fetch;
let form: HTMLFormElement;

// A page with the seed template's search form, and search.js started on it,
// answering from `index`.
function start(index: Entry[]) {
  globalThis.fetch = (async () => new Response(JSON.stringify(index))) as unknown as typeof fetch;
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

async function search(query: string): Promise<HTMLAnchorElement[]> {
  (form.querySelector(".search-toggle") as HTMLElement).click();
  const input = form.querySelector("input")!;
  input.value = query;
  input.dispatchEvent(new Event("input"));
  await waitFor(() => form.querySelector(".search-results")!.children.length > 0);
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
