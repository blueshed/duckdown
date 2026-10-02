// The editor in a site of more than one language: what the tree marks, what
// the open page says of its translations, the drawer that lists what wants
// attention, and the pane for a collection's words in a language.
import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn } from "bun:test";
import { createElement, mount, batch } from "@blueshed/railroad";
import { BASE, signIn, waitFor, keepSite } from "./helpers";
import { notice, tell, hush } from "../server/edit/notice";
import {
  filePath, fileContent, editorContent, folder, drawer, loadFile, collection, openCollection, closeCollection, closeFile,
  translations, languages, languageOf, collectionLanguage, previewShown,
} from "../server/edit/store";
import {
  refreshTranslations, languageName, marksFor, barFor, translate, openTranslation, markUpToDate, SAYS,
} from "../server/edit/translations";
import { Browser } from "../server/edit/components/Browser";
import { Editor } from "../server/edit/components/Editor";
import { Header } from "../server/edit/components/Header";
import { Drawers } from "../server/edit/components/Drawers";
import { HelpDrawer } from "../server/edit/components/Help";
import { TranslationsButton, TranslationBar, TranslationsDrawer } from "../server/edit/components/Translations";
import { CollectionTranslation } from "../server/edit/components/CollectionTranslation";
import { sourceHash } from "../server/languages";
import { leavePast } from "../server/edit/past";

// --- Harness ---

const nativeFetch = globalThis.fetch;
let signedIn: typeof fetch;

keepSite();
beforeAll(async () => {
  const cookie = await signIn();
  // The editor asks for "/edit/pages/…": send that to the server under test.
  signedIn = ((input: RequestInfo | URL, init: RequestInit = {}) =>
    nativeFetch(new URL(String(input), BASE), {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Cookie: cookie },
    })) as typeof fetch;
  globalThis.fetch = signedIn;
});
afterAll(() => {
  globalThis.fetch = nativeFetch;
});

// Answer requests with `respond` instead of the server, until restored.
function intercept(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve().then(() => respond(String(input), init))) as typeof fetch;
  return () => { globalThis.fetch = signedIn; };
}

// Keep the failures these tests stage out of the test output.
let quiet: ReturnType<typeof spyOn>;
beforeAll(() => { quiet = spyOn(console, "error").mockImplementation(() => {}); });
afterAll(() => quiet.mockRestore());
let told: ReturnType<typeof spyOn>;
beforeAll(() => { told = spyOn(console, "info").mockImplementation(() => {}); });
afterAll(() => told.mockRestore());

afterEach(() => {
  batch(() => {
    filePath.set(null);
    fileContent.set("");
    editorContent.set("");
    drawer.set(null);
    folder.set("");
    previewShown.set(false);
  });
  closeCollection();
  leavePast();
  hush();
  translations.set(null);   // the editor's other tests are of a site that has one language
});

function render(node: () => Node) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = mount(host, node);
  return { host, dispose: () => { dispose(); host.remove(); } };
}

const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent!.trim().startsWith(text)) as HTMLButtonElement | undefined;
const click = (el: Element) => (el as HTMLElement).click();
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const put = (key: string, body: string) => signedIn(`/edit/pages/${key}`, { method: "PUT", body });
const read = async (key: string) => (await signedIn(`/edit/pages/${key}`)).text();
const marks = (el: Element) => [...el.querySelectorAll(".mark")].map((m) => m.textContent);
const rowOf = (host: ParentNode, name: string) =>
  [...host.querySelectorAll(".file-list li")].find((li) => li.querySelector("button.row")?.firstChild && li.textContent!.includes(name)) as HTMLElement;

// The seed site, with Welsh beside it: translated and behind (about), begun
// (later), translated in a folder and behind (blog), a Welsh page of its own,
// and the gallery's words given to one work.
const OLD = "00000000";
async function welsh() {
  // What an earlier test made is not part of this one.
  for (const gone of ["de/index.md", "cy/contact.md", "cy/gallery/index.md", "cy/gallery/collection.json"]) {
    await signedIn(`/edit/pages/${gone}`, { method: "DELETE" });
  }
  await put("cy/index.md", "lang: cy\ntitle: Hafan\n\nCroeso");
  await put("about.md", "title: About\n\nUs");
  await put("cy/about.md", `title: Amdanom\ntranslated-from: ${OLD}\n\nNi`);
  await put("contact.md", "title: Contact\n\nWrite");
  await put("later.md", "title: Later\n\nOne day");
  await put("cy/later.md", `title: Yn ddiweddarach\ndraft: true\ntranslated-from: ${OLD}\n\nUn diwrnod`);
  await put("cy/lleol.md", "title: Lleol\n\nDim ond yma");
  await put("cy/blog/one-page-that-looks-different.md", `title: Tudalen\ntranslated-from: ${OLD}\n\nx`);
  await put("cy/gallery/collection.json", JSON.stringify({
    items: { "first-light": { title: "Golau cyntaf", "translated-from": OLD }, "second-wind": { title: "Gwynt" } },
    groups: { paintings: "Paentiadau" },
    labels: { year: { "1961": "Cynnar" } },
  }));
  await refreshTranslations();
}

describe("translations, as the editor knows them", () => {
  test("a site with one language has none to say of", async () => {
    await refreshTranslations();
    expect(translations.get()).toEqual({ main: "en", others: [], rows: [] });
    expect(languages.get()).toEqual([]);
    expect(languageOf("cy/about.md")).toBeNull();
    expect(marksFor("about.md")).toEqual([]);
    expect(barFor("about.md")).toBeNull();
    expect(await collectionLanguage("cy/gallery")).toBeUndefined();
  });

  test("a language by its own name; a tag the browser can't name is itself", () => {
    expect(languageName("cy")).toBe("Cymraeg");
    expect(languageName("fr")).toBe("français");
    expect(languageName("aa-x1")).toBe("aa-x1");
  });

  test("knows which language a key is in", async () => {
    await welsh();
    expect(languages.get()).toEqual(["cy"]);
    expect(languageOf("cy/about.md")).toBe("cy");
    expect(languageOf("cy")).toBe("cy");
    expect(languageOf("about.md")).toBeNull();
    expect(languageOf("cymru/about.md")).toBeNull();
  });

  test("marks what needs attention, in the default's tree, in a language's, and on folders", async () => {
    await welsh();
    // The original names the language that is behind, and the one that has nothing.
    expect(marksFor("about.md")).toEqual([{ kind: "stale", text: "cy ↻", title: "Cymraeg: out of date" }]);
    expect(marksFor("contact.md")).toEqual([{ kind: "missing", text: "cy –", title: "Cymraeg: not translated yet" }]);
    expect(marksFor("later.md")).toEqual([]);                      // begun: a draft is not behind anything a reader has
    // A translation says it of itself.
    expect(marksFor("cy/about.md")).toEqual([{ kind: "stale", text: "↻ out of date", title: "Cymraeg: out of date" }]);
    expect(marksFor("cy/later.md")).toEqual([
      { kind: "stale", text: "↻ out of date", title: "Cymraeg: out of date" },
      { kind: "draft", text: "draft", title: "A draft: readers still have the original" },
    ]);
    expect(marksFor("cy/lleol.md")).toEqual([]);                   // nothing to be behind
    expect(marksFor("cy/nowhere.md")).toEqual([]);
    // A folder counts what is out of date inside it, from either tree.
    expect(marksFor("blog", true)).toEqual([{ kind: "stale", text: "↻ 1", title: "1 translation(s) out of date in here" }]);
    expect(marksFor("cy/blog", true)[0]!.text).toBe("↻ 1");
    expect(marksFor("cy", true)[0]!.text).toMatch(/^↻ \d+$/);       // every one of the language's
    expect(marksFor("guide", true)).toEqual([]);
  });

  test("the bar says what the open page has: each language for an original, where it stands for a translation", async () => {
    await welsh();
    expect(barFor("about.md")).toEqual({ kind: "original", key: "about.md", entries: [{ lang: "cy", standing: "stale", draft: false }] });
    expect(barFor("contact.md")).toEqual({ kind: "original", key: "contact.md", entries: [{ lang: "cy", standing: "missing", draft: false }] });
    expect(barFor("cy/about.md")).toEqual({ kind: "translation", lang: "cy", key: "about.md", standing: "stale", draft: false });
    expect(barFor("cy/later.md")).toEqual({ kind: "translation", lang: "cy", key: "later.md", standing: "stale", draft: true });
    expect(barFor("cy/lleol.md")).toMatchObject({ kind: "translation", standing: "own" });
    expect(barFor("cy/new.md")).toMatchObject({ kind: "translation", standing: "own" });   // one not saved yet
    expect(barFor("theme.css")).toBeNull();
    expect(barFor(null)).toBeNull();
    expect(SAYS.stale).toBe("out of date");
  });
});

describe("starting a translation", () => {
  test("is the page as a draft, saying what it was made from: made, opened, and said", async () => {
    await welsh();
    const source = await read("contact.md");
    expect(await translate("cy", "contact.md")).toBeUndefined();
    const made = await read("cy/contact.md");
    expect(made).toContain("draft: true");
    expect(made).toContain(`translated-from: ${sourceHash(source)}`);
    expect(filePath.get()).toBe("cy/contact.md");
    expect(editorContent.get()).toBe(made);
    expect(notice.get()).toContain("begun as a draft");
    expect(marksFor("contact.md")).toEqual([]);                    // begun: no longer missing, and a draft is nobody's problem yet
    expect(barFor("cy/contact.md")).toMatchObject({ standing: "fresh", draft: true });
  });

  test("is opened, never written over, when it is there already", async () => {
    await welsh();
    hush();
    expect(await translate("cy", "about.md")).toBeUndefined();
    expect(filePath.get()).toBe("cy/about.md");
    expect(await read("cy/about.md")).toContain("Ni");
    expect(notice.get()).toBe("");                                // nothing was begun
  });

  test("adding a language is translating its home into it", async () => {
    await welsh();
    expect(await translate("de", "index.md")).toBeUndefined();
    expect(await read("de/index.md")).toContain("lang: de");
    await waitFor(() => languages.get().includes("de"));
  });

  test("says why it can't, when the server won't, and when it fails", async () => {
    await welsh();
    expect(await translate("zz", "contact.md")).toBe("zz isn't a language of this site");
    let restore = intercept(() => new Response("boom", { status: 500 }));
    expect(await translate("cy", "contact.md")).toBe("Couldn't start translating contact.md");
    restore();
    // The draft arrives and the create fails: the person is told, and nothing is opened.
    restore = intercept((url, init) => init?.method === "PUT"
      ? new Response("no", { status: 500 })
      : new Response("draft: true\n\nx", { status: 200 }));
    filePath.set(null);
    expect(await translate("cy", "contact.md")).toBe("Couldn't create cy/contact.md");
    expect(filePath.get()).toBeNull();
    restore();
  });

  test("opens a translation", async () => {
    await welsh();
    await openTranslation("cy", "about.md");
    expect(filePath.get()).toBe("cy/about.md");
  });
});

describe("saying a translation is up to date", () => {
  test("stamps it with the page as it is, and saves: it is an act, not an edit", async () => {
    await welsh();
    await loadFile("cy/about.md");
    const source = await read("about.md");
    expect(await markUpToDate()).toBe(true);
    const saved = await read("cy/about.md");
    expect(saved).toContain(`translated-from: ${sourceHash(source)}`);
    expect(saved).not.toContain(OLD);
    expect(saved).toContain("Ni");
    expect(editorContent.get()).toBe(saved);
    expect(barFor("cy/about.md")).toMatchObject({ standing: "fresh" });
    expect(marksFor("about.md")).toEqual([]);
  });

  test("says the words as they are in the box, not as they were saved", async () => {
    await welsh();
    await loadFile("cy/about.md");
    editorContent.set(`title: Amdanom ni\ntranslated-from: ${OLD}\n\nNi, a mwy`);
    await markUpToDate();
    expect(await read("cy/about.md")).toContain("Ni, a mwy");
  });

  test("is nothing for a page that is no translation, and says when it can't", async () => {
    await welsh();
    await loadFile("about.md");
    expect(await markUpToDate()).toBe(false);
    await loadFile("cy/about.md");
    let restore = intercept(() => new Response("no", { status: 500 }));
    expect(await markUpToDate()).toBe(false);
    restore();
    // The stamp arrives and the save fails.
    restore = intercept((url, init) => url.includes("stamp") ? new Response("stamped", { status: 200 }) : new Response("no", { status: 500 }));
    expect(await markUpToDate()).toBe(false);
    restore();
  });
});

describe("the tree, in a site of more than one language", () => {
  test("marks the rows that want attention, and says them to a screen reader", async () => {
    await welsh();
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => host.querySelector(".file-list li"));
    await waitFor(() => host.querySelector(".mark"));
    const about = rowOf(host, "about.md");
    expect(marks(about)).toEqual(["cy ↻"]);
    const label = about.querySelector(".mark")!;
    expect(label.getAttribute("role")).toBe("img");
    expect(label.getAttribute("aria-label")).toBe("Cymraeg: out of date");
    expect(label.getAttribute("title")).toBe("Cymraeg: out of date");
    expect(label.className).toContain("mark-stale");
    expect(marks(rowOf(host, "contact.md"))).toEqual(["cy –"]);
    expect(marks(rowOf(host, "later.md"))).toEqual([]);
    // A folder says how many in it are behind; the language's folder, all of its.
    expect(marks(rowOf(host, "blog"))).toEqual(["↻ 1"]);
    expect(marks(rowOf(host, "cy"))[0]).toMatch(/^↻ \d+$/);
    dispose();
  });

  test("in a language's folder, a row says it of itself", async () => {
    await welsh();
    folder.set("cy");
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => host.querySelector(".mark"));
    expect(marks(rowOf(host, "about.md"))).toEqual(["↻ out of date"]);
    expect(marks(rowOf(host, "later.md"))).toEqual(["↻ out of date", "draft"]);
    expect(marks(rowOf(host, "lleol.md"))).toEqual([]);
    expect(marks(rowOf(host, "blog"))).toEqual(["↻ 1"]);
    dispose();
  });

  test("follows a row when what it says changes", async () => {
    await welsh();
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => host.querySelector(".mark"));
    expect(marks(rowOf(host, "contact.md"))).toEqual(["cy –"]);
    await translate("cy", "contact.md");
    // Opening the translation takes the tree to its folder, where it is a draft.
    await waitFor(() => marks(rowOf(host, "contact.md")).join() === "draft");
    dispose();
  });

  test("opens a collection in a language's folder as its words, and elsewhere as the collection", async () => {
    await welsh();
    folder.set("cy/gallery");
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rowOf(host, "collection.json"));
    click(rowOf(host, "collection.json").querySelector("button.row")!);
    await waitFor(() => collection.get()?.lang === "cy");
    expect(collection.get()).toEqual({ folder: "cy/gallery", lang: "cy" });
    closeCollection();
    folder.set("gallery");
    await waitFor(() => rowOf(host, "collection.json"));
    click(rowOf(host, "collection.json").querySelector("button.row")!);
    await waitFor(() => collection.get()?.folder === "gallery");
    expect(collection.get()!.lang).toBeUndefined();
    dispose();
  });

  test("asks which folders are languages' before it offers a collection, as the editor starts", async () => {
    await welsh();
    await put("cy/gallery/index.md", "title: Oriel\n\n{{items}}");
    translations.set(null);                                         // nothing has asked yet
    await loadFile("cy/gallery/index.md");
    await waitFor(() => collection.get() !== null);
    expect(collection.get()).toEqual({ folder: "cy/gallery", lang: "cy" });   // never the collection's own pane, which would edit the words as works
    expect(languages.get()).toEqual(["cy"]);
  });

  test("opens a collection.json row in a language's folder as its words, though the languages weren't known yet", async () => {
    await welsh();
    folder.set("cy/gallery");
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rowOf(host, "collection.json"));
    translations.set(null);
    click(rowOf(host, "collection.json").querySelector("button.row")!);
    await waitFor(() => collection.get()?.lang === "cy");
    dispose();
  });

  test("offers the language's collection beneath the folder's index", async () => {
    await welsh();
    await put("cy/gallery/index.md", "title: Oriel\n\n{{items}}");
    await loadFile("cy/gallery/index.md");
    await waitFor(() => collection.get() !== null);
    expect(collection.get()).toEqual({ folder: "cy/gallery", lang: "cy" });
    expect(await collectionLanguage("cy")).toBeUndefined();         // the language's home has no collection of the default's
    expect(await collectionLanguage("cy/nowhere")).toBeUndefined();
  });
});

describe("the bar over the open page", () => {
  const bar = (host: ParentNode) => host.querySelector(".translation-bar");

  test("is not there when there is no other language, or the file isn't a page", async () => {
    translations.set({ main: "en", others: [], rows: [] });
    filePath.set("about.md");
    const { host, dispose } = render(() => <TranslationBar />);
    expect(bar(host)).toBeNull();
    await welsh();
    filePath.set("theme.css");
    expect(bar(host)).toBeNull();
    filePath.set(null);
    expect(bar(host)).toBeNull();
    dispose();
  });

  test("on an original, lists each language and where it stands, to translate or to open", async () => {
    await welsh();
    filePath.set("contact.md");
    const { host, dispose } = render(() => <TranslationBar />);
    expect(bar(host)!.getAttribute("role")).toBe("group");
    const entry = host.querySelector(".translation-entries li")!;
    expect(entry.querySelector(".translation-lang")!.textContent).toBe("Cymraeg");
    expect(entry.querySelector(".translation-lang")!.getAttribute("lang")).toBe("cy");
    expect(entry.querySelector(".translation-state")!.textContent).toBe("not translated yet");
    expect(button(entry, "Translate")!.getAttribute("aria-label")).toBe("Translate into Cymraeg");
    click(button(entry, "Translate")!);
    await waitFor(() => filePath.get() === "cy/contact.md");

    filePath.set("about.md");
    await waitFor(() => button(host, "Open"));
    expect(host.querySelector(".translation-state")!.textContent).toBe("out of date");
    expect(button(host, "Open")!.getAttribute("aria-label")).toBe("Open the Cymraeg translation");
    click(button(host, "Open")!);
    await waitFor(() => filePath.get() === "cy/about.md");
    dispose();
  });

  test("says a draft is a draft", async () => {
    await welsh();
    filePath.set("later.md");
    const { host, dispose } = render(() => <TranslationBar />);
    expect(host.querySelector(".translation-state")!.textContent).toBe("out of date · draft");
    dispose();
  });

  test("on a translation, says where it stands, goes to the original, and says it is caught up", async () => {
    await welsh();
    filePath.set("cy/about.md");
    const { host, dispose } = render(() => <TranslationBar />);
    expect(host.querySelector(".translation-line .translation-lang")!.textContent).toBe("Cymraeg");
    expect(host.querySelector(".translation-line .translation-state")!.textContent).toBe("out of date");
    expect(button(host, "Mark up to date")).toBeDefined();
    click(button(host, "Open original")!);
    await waitFor(() => filePath.get() === "about.md");

    await loadFile("cy/about.md");
    click(button(host, "Mark up to date")!);
    await waitFor(() => host.querySelector(".translation-state")!.textContent === "up to date");
    expect(button(host, "Mark up to date")).toBeUndefined();         // nothing to say any more
    dispose();
  });

  test("a page of the language's own has no original to go to, and nothing to catch up with", async () => {
    await welsh();
    filePath.set("cy/lleol.md");
    const { host, dispose } = render(() => <TranslationBar />);
    expect(host.querySelector(".translation-state")!.textContent).toBe("has no original");
    expect(button(host, "Open original")).toBeUndefined();
    expect(button(host, "Mark up to date")).toBeUndefined();
    dispose();
  });

  test("an unchecked translation can say it is caught up", async () => {
    await welsh();
    await put("cy/contact.md", "title: Cysylltu\n\nYsgrifennwch");
    await refreshTranslations();
    filePath.set("cy/contact.md");
    const { host, dispose } = render(() => <TranslationBar />);
    expect(host.querySelector(".translation-state")!.textContent).toBe("not checked");
    expect(button(host, "Mark up to date")).toBeDefined();
    dispose();
  });

  test("sits between the header and the text in the editor", async () => {
    await welsh();
    await loadFile("about.md");
    const { host, dispose } = render(() => <Editor />);
    const area = host.querySelector(".editor-area")!;
    expect([...area.children].map((c) => c.className.split(" ")[0])).toEqual(["pane-header", "translation-bar", ""]);
    dispose();
  });
});

describe("Help, in a language's folder", () => {
  test("puts what is said of another language first", async () => {
    await welsh();
    batch(() => {
      filePath.set("cy/about.md");
      editorContent.set("title: Amdanom\n\nNi");
    });
    const { host, dispose } = render(() => <HelpDrawer />);
    await waitFor(() => host.querySelector(".help-section"));
    expect((host.querySelector(".help-section") as HTMLElement).dataset.help).toBe("languages");
    expect(host.querySelector(".help-section summary")!.textContent).toBe("Another language");
    filePath.set("about.md");
    await waitFor(() => (host.querySelector(".help-section") as HTMLElement).dataset.help === "page");
    dispose();
  });
});

describe("the header's Translations", () => {
  test("is a button that opens its drawer, with a badge for what is out of date", async () => {
    await welsh();
    const { host, dispose } = render(() => <div><TranslationsButton /><Drawers /></div>);
    const open = button(host, "Translations")!;
    expect(open.getAttribute("aria-expanded")).toBe("false");
    const badge = open.querySelector(".badge")!;
    expect(badge.textContent).toBe("3");                           // about, the blog page and First Light; a draft is not behind a reader
    expect(badge.getAttribute("aria-label")).toBe("3 out of date");
    click(open);
    expect(drawer.get()).toBe("translations");
    expect(open.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => host.querySelector(".sidebar h3"));
    expect(host.querySelector(".sidebar h3")!.textContent).toBe("Translations");
    dispose();
  });

  test("is there for a site with one language, with no badge, and asks the server again when something is written", async () => {
    translations.set({ main: "en", others: [], rows: [] });
    const asked: string[] = [];
    const restore = intercept((url) => {
      asked.push(url);
      return Response.json({ main: "en", others: [], rows: [] });
    });
    const { host, dispose } = render(() => <TranslationsButton />);
    expect(button(host, "Translations")!.querySelector(".badge")).toBeNull();
    await waitFor(() => asked.includes("/edit/translations"), 1500);
    restore();
    dispose();
  });

  test("is in the header", () => {
    const { host, dispose } = render(() => <Header />);
    expect(button(host, "Translations")).toBeDefined();
    dispose();
  });
});

describe("the Translations drawer", () => {
  test("a site with one language is told so, and offered another", async () => {
    translations.set({ main: "en", others: [], rows: [] });
    const restore = intercept(() => Response.json({ main: "en", others: [], rows: [] }));
    const { host, dispose } = render(() => <TranslationsDrawer />);
    expect(host.querySelector(".dialog-hint")!.textContent).toContain("This site is in one language");
    expect(host.querySelector('input[name="code"]')).not.toBeNull();
    restore();
    dispose();
  });

  test("lists what wants attention by language, out of date first, each a way to the thing", async () => {
    await welsh();
    const { host, dispose } = render(() => <TranslationsDrawer />);
    await waitFor(() => host.querySelector(".translation-group li"));
    expect(host.querySelector(".translation-group h4")!.textContent).toBe("Cymraeg");
    const items = [...host.querySelectorAll(".translation-group li")]
      .map((li) => `${li.querySelector(".history-label")!.textContent} — ${li.querySelector(".history-detail")!.textContent}`);
    const stale = items.filter((i) => i.endsWith("— out of date"));
    expect(stale.slice(0, 2)).toEqual(["about.md — out of date", "blog/one-page-that-looks-different.md — out of date"]);
    expect(items.indexOf(stale.at(-1)!)).toBeLessThan(items.findIndex((i) => i.endsWith("— not translated yet")));
    expect(items.some((i) => i.startsWith("later.md"))).toBe(false);           // a draft is being worked on
    // An item of a collection is named for its collection.
    expect(items).toContain("first-light (gallery) — out of date");
    expect(items).toContain("study-in-green (gallery) — not translated yet");

    // A page is opened; one nobody has begun is begun; an item opens its words.
    click(button(host, "about.md")!);
    await waitFor(() => filePath.get() === "cy/about.md");
    click(button(host, "contact.md")!);
    await waitFor(() => filePath.get() === "cy/contact.md");
    click(button(host, "first-light (gallery)")!);
    await waitFor(() => collection.get()?.lang === "cy");
    expect(collection.get()!.folder).toBe("cy/gallery");
    dispose();
  });

  test("says when everything is as it should be", async () => {
    translations.set({ main: "en", others: ["cy"], rows: [{ lang: "cy", key: "about.md", standing: "fresh", draft: false }] });
    const restore = intercept(() => Response.json({ main: "en", others: ["cy"], rows: [{ lang: "cy", key: "about.md", standing: "fresh", draft: false }] }));
    const { host, dispose } = render(() => <TranslationsDrawer />);
    expect(host.querySelector(".translation-group .dialog-hint")!.textContent).toBe("Everything is translated, and up to date.");
    expect(host.querySelector(".dialog-hint")!.textContent).not.toContain("one language");
    restore();
    dispose();
  });

  test("stops at a hundred a language, and says how many more", async () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({ lang: "cy", key: `p${String(i).padStart(3, "0")}.md`, standing: "missing" as const, draft: false }));
    translations.set({ main: "en", others: ["cy"], rows });
    const restore = intercept(() => Response.json({ main: "en", others: ["cy"], rows }));
    const { host, dispose } = render(() => <TranslationsDrawer />);
    expect(host.querySelectorAll(".translation-group li")).toHaveLength(100);
    expect(host.querySelector(".translation-group > .dialog-hint")!.textContent).toBe("…and 30 more.");
    restore();
    dispose();
  });

  test("adds a language by its code, and says why when it can't", async () => {
    await welsh();
    const { host, dispose } = render(() => <TranslationsDrawer />);
    const input = host.querySelector('input[name="code"]') as HTMLInputElement;
    const form = input.closest("form")!;
    form.dispatchEvent(new Event("submit", { cancelable: true }));         // nothing typed: nothing to do
    expect(host.querySelector('[role="alert"]')).toBeNull();

    input.value = "Welsh";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await waitFor(() => host.querySelector('[role="alert"]'));
    expect(host.querySelector('[role="alert"]')!.textContent).toBe("welsh isn't a language of this site");
    expect(input.value).toBe("Welsh");                                       // left, to be put right

    input.value = " DE ";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await waitFor(() => languages.get().includes("de"));
    expect(input.value).toBe("");
    await waitFor(() => host.querySelector('[role="alert"]') === null);
    expect(await read("de/index.md")).toContain("lang: de");
    dispose();
  });
});

describe("a collection's words in a language", () => {
  const pane = () => document.querySelector(".panel-collection")!;
  const field = (slug: string, name: string) => pane().querySelector(`#tr-${slug}-${name}`) as HTMLInputElement;
  const edit = (el: Element, value: string) => {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event("change"));
  };
  const stored = async () => JSON.parse(await read("cy/gallery/collection.json"));
  const open = async () => {
    await welsh();
    openCollection("cy/gallery", "cy");
    const rendered = render(() => <CollectionTranslation />);
    await waitFor(() => rendered.host.querySelector(".translation-item"));
    return rendered;
  };

  test("shows the default's items beside the words the language gives each, and how each stands", async () => {
    const { host, dispose } = await open();
    expect(host.querySelector(".pane-name")!.textContent).toBe("cy/gallery/collection.json");
    const items = [...host.querySelectorAll(".translation-item")];
    expect(items).toHaveLength(4);
    const first = items[0]!;
    expect(first.querySelector(".item-title")!.textContent).toBe("First Light");
    expect(first.querySelector(".translation-state")!.textContent).toBe("out of date");
    expect(first.querySelector(".thumb")).not.toBeNull();
    // The original's words are beside each box; the box holds the language's.
    expect(first.querySelector(".field-default")!.textContent).toBe("First Light");
    expect(field("first-light", "title").value).toBe("Golau cyntaf");
    expect(field("first-light", "title").getAttribute("lang")).toBe("cy");
    expect(field("first-light", "caption").tagName).toBe("TEXTAREA");
    expect(field("first-light", "caption").value).toBe("");
    expect(items[1]!.querySelector(".translation-state")!.textContent).toBe("not checked");
    expect(items[2]!.querySelector(".translation-state")!.textContent).toBe("not translated yet");
    expect(host.querySelector(".pane-note")!.textContent).toContain("Cymraeg");
    // Group names are boxes of their own.
    expect((host.querySelector('[data-group="paintings"]') as HTMLInputElement).value).toBe("Paentiadau");
    expect(host.querySelector('[data-group="studies"]')).not.toBeNull();
    dispose();
  });

  test("words typed for an item with none say what they were made from; saving writes the file, keeping what the pane doesn't show", async () => {
    const { host, dispose } = await open();
    const before = JSON.parse(await (await signedIn("/edit/translations?items=cy&folder=gallery")).text());
    const hash = before.items.find((i: { slug: string }) => i.slug === "study-in-green").hash;
    edit(field("study-in-green", "title"), "Astudiaeth werdd");
    expect(host.querySelector(".dot")).not.toBeNull();                       // unsaved
    expect(items(host)[2]!.querySelector(".translation-state")!.textContent).toBe("up to date");   // the standing follows what is typed
    click(button(host, "Save")!);
    await waitFor(() => host.querySelector(".dot") === null);
    const file = await stored();
    expect(file.items["study-in-green"]).toEqual({ title: "Astudiaeth werdd", "translated-from": hash });
    expect(file.items["first-light"].title).toBe("Golau cyntaf");           // the rest as it was
    expect(file.labels).toEqual({ year: { "1961": "Cynnar" } });             // and a key the pane doesn't show
    await waitFor(() => translations.get()?.rows.some((r) => r.key === "gallery/collection.json#study-in-green" && r.standing === "fresh"));
    dispose();
  });

  const items = (host: ParentNode) => [...host.querySelectorAll(".translation-item")];

  test("words changed for an item that had some keep what they say they were made from, until it is said to be up to date", async () => {
    const { host, dispose } = await open();
    edit(field("first-light", "caption"), "Inc ar bapur");
    expect(items(host)[0]!.querySelector(".translation-state")!.textContent).toBe("out of date");
    const upToDate = button(items(host)[0]!, "Up to date")!;
    click(upToDate);
    expect(items(host)[0]!.querySelector(".translation-state")!.textContent).toBe("up to date");
    expect(button(items(host)[0]!, "Up to date")).toBeUndefined();
    click(button(host, "Save")!);
    await waitFor(() => host.querySelector(".dot") === null);
    const hash = JSON.parse(await (await signedIn("/edit/translations?items=cy&folder=gallery")).text()).items[0].hash;
    expect((await stored()).items["first-light"]).toEqual({ title: "Golau cyntaf", caption: "Inc ar bapur", "translated-from": hash });
    // An item that said nothing of where it came from can be caught up too.
    click(button(items(host)[1]!, "Up to date")!);
    expect(items(host)[1]!.querySelector(".translation-state")!.textContent).toBe("up to date");
    dispose();
  });

  test("emptying every box of an item takes it out of the file, and it is untranslated again", async () => {
    const { host, dispose } = await open();
    edit(field("second-wind", "title"), "");
    expect(items(host)[1]!.querySelector(".translation-state")!.textContent).toBe("not translated yet");
    click(button(host, "Save")!);
    await waitFor(() => host.querySelector(".dot") === null);
    expect((await stored()).items["second-wind"]).toBeUndefined();
    dispose();
  });

  test("names a group in the language, and takes the name away", async () => {
    const { host, dispose } = await open();
    edit(host.querySelector('[data-group="studies"]')!, "Astudiaethau");
    edit(host.querySelector('[data-group="paintings"]')!, "");
    click(button(host, "Save")!);
    await waitFor(() => host.querySelector(".dot") === null);
    expect((await stored()).groups).toEqual({ studies: "Astudiaethau" });
    dispose();
  });

  test("a language with no file yet starts one", async () => {
    await welsh();
    await signedIn("/edit/pages/cy/gallery/collection.json", { method: "DELETE" });
    await refreshTranslations();
    openCollection("cy/gallery", "cy");
    const { host, dispose } = render(() => <CollectionTranslation />);
    await waitFor(() => host.querySelector(".translation-item"));
    expect(items(host).every((i) => i.querySelector(".translation-state")!.textContent === "not translated yet")).toBe(true);
    edit(field("first-light", "title"), "Golau");
    click(button(host, "Save")!);
    await waitFor(() => host.querySelector(".dot") === null);
    expect((await stored()).items["first-light"].title).toBe("Golau");
    dispose();
  });

  test("a failed save leaves it unsaved, and the notice says why", async () => {
    const { host, dispose } = await open();
    edit(field("study-in-green", "title"), "x");
    const restore = intercept(() => new Response("no", { status: 500 }));
    click(button(host, "Save")!);
    await waitFor(() => notice.get().startsWith("Couldn't save"));
    expect(host.querySelector(".dot")).not.toBeNull();
    restore();
    dispose();
  });

  test("a collection it can't read, or a file that isn't JSON, is said where the items would be", async () => {
    await welsh();
    let restore = intercept(() => new Response("no", { status: 500 }));
    openCollection("cy/gallery", "cy");
    let rendered = render(() => <CollectionTranslation />);
    await waitFor(() => rendered.host.querySelector(".placeholder")!.textContent === "This folder's collection can't be read.");
    restore();
    rendered.dispose();

    await put("cy/gallery/collection.json", "{ not json");
    openCollection("cy/gallery", "cy");
    rendered = render(() => <CollectionTranslation />);
    await waitFor(() => rendered.host.querySelector(".placeholder")!.textContent!.includes("isn't JSON"));
    expect(rendered.host.querySelector(".translation-item")).toBeNull();
    rendered.dispose();
  });

  test("the language's own home, with no collection of the default's to translate, is a collection of its own", async () => {
    await welsh();
    openCollection("cy", "cy");
    const { host, dispose } = render(() => <CollectionTranslation />);
    await waitFor(() => host.querySelector(".placeholder")!.textContent === "This folder's collection can't be read.");
    dispose();
  });

  test("deletes the language's words, which the server keeps, and closes", async () => {
    const { host, dispose } = await open();
    click(host.querySelector('[aria-label^="Delete"]')!);
    await waitFor(() => host.querySelector("dialog[open], dialog"));
    click(button(host.querySelector("dialog")!, "Delete")!);
    await waitFor(() => collection.get() === null);
    expect((await signedIn("/edit/pages/cy/gallery/collection.json")).status).toBe(404);
    dispose();
  });

  test("a delete of a file that was never written closes all the same", async () => {
    await welsh();
    await signedIn("/edit/pages/cy/gallery/collection.json", { method: "DELETE" });
    openCollection("cy/gallery", "cy");
    const { host, dispose } = render(() => <CollectionTranslation />);
    await waitFor(() => host.querySelector(".translation-item"));
    click(host.querySelector('[aria-label^="Delete"]')!);
    await waitFor(() => host.querySelector("dialog"));
    click(button(host.querySelector("dialog")!, "Delete")!);
    await waitFor(() => collection.get() === null);
    dispose();
  });

  test("the folder's own pane is not this one: choosing another collection builds a new pane", async () => {
    await welsh();
    openCollection("gallery");
    expect(collection.get()).toEqual({ folder: "gallery", lang: undefined });
    openCollection("cy/gallery", "cy");
    expect(collection.get()).toEqual({ folder: "cy/gallery", lang: "cy" });
    tell("x");
    closeFile();
  });
});
