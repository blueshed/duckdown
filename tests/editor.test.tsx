// The editor's own code, in happy-dom, talking to the real server in this
// process (signed in). Failures are staged with intercept().
import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn, mock } from "bun:test";
import { createElement, mount, batch, signal, when } from "@blueshed/railroad";
import { BASE, SITE, signIn, waitFor, keepSite } from "./helpers";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { api, apiJson, urlPath } from "../server/edit/api";
import { notice, news, speak, tell, hush } from "../server/edit/notice";
import {
  filePath, fileContent, editorContent, showImages, browserRevision, folder, openFolder, drawer, shortName,
  loadFile, createFile, saveFile, deleteFile, closeFile, moveFile, reloadBrowser, toggleImages, closeImages, toggleDrawer,
  resource, resourceDraft, resourceSaved, resourceDirty, pageLayout, pageIncludes, openResource, closeResource,
  saveResource, deleteResource, createResource,
  collection, openCollection, closeCollection, createCollection, leftDrawer,
} from "../server/edit/store";
import { Icon } from "../server/edit/components/Icon";
import { Notice } from "../server/edit/components/Notice";
import { ConfirmDialog } from "../server/edit/components/ConfirmDialog";
import { NewDialog } from "../server/edit/components/NewDialog";
import { Browser } from "../server/edit/components/Browser";
import { Editor } from "../server/edit/components/Editor";
import { Preview } from "../server/edit/components/Preview";
import { CssPreview } from "../server/edit/components/CssPreview";
import { Header } from "../server/edit/components/Header";
import { Trail, folderCrumbs } from "../server/edit/components/Trail";
import { EditorsDrawer } from "../server/edit/components/Users";
import { Drawers, LeftDrawer } from "../server/edit/components/Drawers";
import { PublishButton, publishState, refreshPublish } from "../server/edit/components/Publish";
import { ImageBrowser } from "../server/edit/components/ImageBrowser";
import { ResourceList } from "../server/edit/components/ResourceList";
import { ResourcePane } from "../server/edit/components/ResourcePane";
import { CollectionPane, itemAddresses, firstWork, same } from "../server/edit/components/CollectionPane";
import { parseCollection } from "../server/collection";
import { PastList, PastPane, PastPreview } from "../server/edit/components/Past";
import {
  past, entries, seen, openVersions, openDeleted, look, leavePast, restoreSeen, changedLines, whenKept, COMPARE_LIMIT,
} from "../server/edit/past";

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
// And the news they cause (tell() logs to console.info).
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
  });
  leavePast();
  hush();
});

function render(node: () => Node) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = mount(host, node);
  return { host, dispose: () => { dispose(); host.remove(); } };
}

const rows = (root: ParentNode) => [...root.querySelectorAll(".file-list li")].map((li) => li.textContent!.trim());
const row = (root: ParentNode, text: string) =>
  [...root.querySelectorAll(".file-list li")].find((li) => li.textContent!.trim() === text) as HTMLElement;
// A row's control: a button, so the tree is reachable by Tab (a report's is its link).
const rowControl = (root: ParentNode, text: string) =>
  row(root, text).querySelector("button.row, a.report") as HTMLElement;
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent!.trim().startsWith(text)) as HTMLButtonElement | undefined;
const click = (el: Element) => (el as HTMLElement).click();
// What a trail says, crumb by crumb.
const trailOf = (root: ParentNode) =>
  [...root.querySelectorAll(".crumb")].map((c) => c.textContent!.trim()).join(" › ");
function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}
const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event("submit", { cancelable: true }));
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// --- notice.ts / api.ts ---

describe("notice", () => {
  test("speak shows a message (and logs it); hush clears it", () => {
    speak("Couldn't do the thing");
    expect(notice.get()).toBe("Couldn't do the thing");
    expect(quiet).toHaveBeenCalledWith("Couldn't do the thing");
    hush();
    expect(notice.get()).toBe("");
  });
});

describe("api", () => {
  test("passes an ok answer through", async () => {
    const res = await api("list pages", "/edit/pages/");
    expect(res.ok).toBe(true);
    expect(notice.get()).toBe("");
  });

  test("a failed answer speaks: status and first line of the reason", async () => {
    const restore = intercept(() => new Response("Server error: disk full\nat write()", { status: 500 }));
    try {
      const res = await api("save a.md", "/edit/pages/a.md", { method: "PUT" });
      expect(res.status).toBe(500);
      expect(notice.get()).toBe("Couldn't save a.md: 500 Server error: disk full");
    } finally {
      restore();
    }
  });

  test("an empty reason falls back to the status text", async () => {
    const restore = intercept(() => new Response("", { status: 503, statusText: "Service Unavailable" }));
    try {
      await api("open a.md", "/edit/pages/a.md");
      expect(notice.get()).toBe("Couldn't open a.md: 503 Service Unavailable");
    } finally {
      restore();
    }
  });

  test("a status the caller handles stays quiet", async () => {
    const restore = intercept(() => new Response("Already exists", { status: 412 }));
    try {
      expect((await api("create a.md", "/edit/pages/a.md", { method: "PUT" }, [412])).status).toBe(412);
      expect(notice.get()).toBe("");
    } finally {
      restore();
    }
  });

  test("no answer at all speaks, and resolves to a failed response", async () => {
    const restore = intercept(() => Promise.reject(new TypeError("fetch failed")));
    try {
      const res = await api("list pages", "/edit/pages/");
      expect(res.ok).toBe(false);
      expect(notice.get()).toBe("Couldn't list pages: the server didn't answer.");
    } finally {
      restore();
    }
  });

  test("signed out (401), the page goes to the login form and back, and the caller waits", async () => {
    history.replaceState(null, "", "/edit?path=index.md");
    const assign = spyOn(location, "assign").mockImplementation(() => {});
    const restore = intercept(() => new Response("Unauthorized", { status: 401 }));
    try {
      const outcome = await Promise.race([
        api("list pages", "/edit/pages/").then(() => "answered"),
        settle(50).then(() => "parked"),
      ]);
      expect(outcome).toBe("parked");
      expect(assign).toHaveBeenCalledWith("/login?next=%2Fedit%3Fpath%3Dindex.md");
    } finally {
      restore();
      assign.mockRestore();
      history.replaceState(null, "", "/edit");
    }
  });

  test("apiJson: the parsed answer, or null once the failure has spoken", async () => {
    expect((await apiJson<{ files: unknown[] }>("list pages", "/edit/pages/"))!.files.length).toBeGreaterThan(0);
    let restore = intercept(() => new Response("<html>", { status: 200 }));
    try {
      expect(await apiJson("list pages", "/edit/pages/")).toBeNull();
      expect(notice.get()).toBe("Couldn't list pages: the answer wasn't JSON.");
    } finally {
      restore();
    }
    restore = intercept(() => new Response("nope", { status: 500 }));
    try {
      expect(await apiJson("list pages", "/edit/pages/")).toBeNull();
    } finally {
      restore();
    }
  });

  test("urlPath encodes each segment and keeps the slashes", () => {
    expect(urlPath("My folder/a #1?.md")).toBe("My%20folder/a%20%231%3F.md");
  });
});

// --- store.ts ---

describe("store", () => {
  test("loadFile opens a page; a missing one speaks and opens nothing", async () => {
    expect(await loadFile("/index.md")).toBe(true);
    expect(filePath.get()).toBe("index.md");
    expect(editorContent.get()).toContain("Welcome to duckdown");
    expect(await loadFile("nope.md")).toBe(false);
    expect(filePath.get()).toBe("index.md");
    expect(notice.get()).toBe("Couldn't open nope.md: 404 Not Found");
  });

  test("createFile makes a page, titled, and never overwrites", async () => {
    const before = browserRevision.get();
    expect(await createFile("/store-made.md", "store-made.md")).toBeUndefined();
    expect(editorContent.get()).toBe("title: store-made\n\n");
    expect(browserRevision.get()).toBe(before + 1);
    expect(await createFile("/store-made.md", "store-made.md")).toBe("store-made.md already exists");
    // A folder's index is titled by the folder, not by "index"
    expect(await createFile("/store-folder/index.md", "store-folder")).toBeUndefined();
    expect(editorContent.get()).toBe("title: store-folder\n\n");
  });

  test("closeFile puts the page down without deleting it", async () => {
    await loadFile("index.md");
    pageLayout.set("site.html");
    closeFile();
    expect(filePath.get()).toBeNull();
    expect(editorContent.get()).toBe("");
    // The layout described the open page; with none open it describes nothing,
    // or the resource pane says what "the page you are looking at" wears.
    expect(pageLayout.get()).toBe("");
    expect(await (await fetch(`${BASE}/edit/pages/index.md`)).text()).toContain("Welcome to duckdown");
  });

  test("createFile reports a failure it doesn't expect", async () => {
    const restore = intercept(() => new Response("boom", { status: 500 }));
    try {
      expect(await createFile("/x.md", "x.md")).toBe("Couldn't create x.md");
      expect(notice.get()).toBe("Couldn't create x.md: 500 boom");
    } finally {
      restore();
    }
  });

  test("saveFile and deleteFile say whether they worked", async () => {
    expect(await saveFile()).toBe(false); // nothing open
    expect(await deleteFile()).toBe(false);
    await createFile("/store-save.md", "store-save.md");
    editorContent.set("title: saved\n\n# Saved");
    expect(await saveFile()).toBe(true);
    expect(fileContent.get()).toBe("title: saved\n\n# Saved");
    const restore = intercept(() => new Response("nope", { status: 500 }));
    try {
      editorContent.set("lost?");
      expect(await saveFile()).toBe(false);
      expect(fileContent.get()).toBe("title: saved\n\n# Saved");
      expect(await deleteFile()).toBe(false);
      expect(filePath.get()).toBe("store-save.md");
    } finally {
      restore();
    }
    expect(await deleteFile()).toBe(true);
    expect(filePath.get()).toBeNull();
  });

  test("the image sidebar toggles and closes, and reloadBrowser bumps the revision", () => {
    toggleImages();
    expect(showImages.get()).toBe(true);
    closeImages();
    expect(showImages.get()).toBe(false);
    const before = browserRevision.get();
    reloadBrowser();
    expect(browserRevision.get()).toBe(before + 1);
  });
});

// --- Components ---

describe("Icon", () => {
  test("draws a sized, screen-reader-hidden icon; an unknown name shows as text", () => {
    const { host, dispose } = render(() => <div><Icon name="save" size={12} /><Icon name="no-such-icon" /></div>);
    const icon = host.querySelector(".icon")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.innerHTML).toContain('width="12"');
    expect(host.textContent).toContain("no-such-icon");
    dispose();
  });
});

describe("Notice", () => {
  test("shows a failure as an alert until dismissed", () => {
    const { host, dispose } = render(() => <Notice />);
    expect(host.querySelector(".notice")).toBeNull();
    // The regions are there before anything is said in them.
    expect(host.querySelectorAll('[role="alert"], [role="status"]')).toHaveLength(2);
    speak("Couldn't save a.md: 500 boom");
    const alert = host.querySelector('[role="alert"] > .notice')!;
    expect(alert.textContent).toContain("Couldn't save a.md: 500 boom");
    click(host.querySelector('[aria-label="Dismiss"]')!);
    expect(host.querySelector(".notice")).toBeNull();
    dispose();
  });

  test("news is said in the same place, as a status rather than an alert, until a failure replaces it", () => {
    const { host, dispose } = render(() => <Notice />);
    tell("First is now /gallery/first-light/; the old address still leads there.");
    const status = host.querySelector(".notice")!;
    expect(status.parentElement!.getAttribute("role")).toBe("status");
    expect(status.className).toBe("notice news");
    expect(told).toHaveBeenCalledWith("First is now /gallery/first-light/; the old address still leads there.");
    speak("Couldn't save a.md: 500 boom");
    expect(host.querySelectorAll(".notice")).toHaveLength(1);
    expect(host.querySelector(".notice")!.parentElement!.getAttribute("role")).toBe("alert");
    expect(host.querySelector(".notice")!.className).toBe("notice");
    expect(news.get()).toBe(false);
    dispose();
  });
});

describe("ConfirmDialog", () => {
  test("asks, and answers cancel or confirm", async () => {
    const onconfirm = mock(() => {});
    const oncancel = mock(() => {});
    const { host, dispose } = render(() => (
      <ConfirmDialog title="Delete a.md?" message="This cannot be undone." onconfirm={onconfirm} oncancel={oncancel} />
    ));
    const dialog = host.querySelector("dialog")!;
    await waitFor(() => dialog.open);
    expect(dialog.textContent).toContain("This cannot be undone.");
    click(button(dialog, "Delete")!);
    expect(onconfirm).toHaveBeenCalledTimes(1);
    click(button(dialog, "Cancel")!);
    expect(oncancel).toHaveBeenCalled();
    dispose();
  });

  test("is named by its heading, and gives focus back when it is taken away", async () => {
    // What a confirmed dialog does: the when() that made it drops it, without
    // a close() — which left focus on <body>. It goes back to what opened it.
    const asking = signal(false);
    const { host, dispose } = render(() => (
      <div>
        <button onclick={() => asking.set(true)}>Delete</button>
        {when(asking, () => <ConfirmDialog title="Delete a.md?" onconfirm={() => asking.set(false)} oncancel={() => asking.set(false)} />)}
      </div>
    ));
    const opener = host.querySelector("button")!;
    opener.focus();
    click(opener);
    await waitFor(() => host.querySelector("dialog")?.open);
    const dialog = host.querySelector("dialog")!;
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Delete a.md?");
    (dialog.querySelector("button.danger") as HTMLElement).focus();
    click(dialog.querySelector("button.danger")!);
    expect(host.querySelector("dialog")).toBeNull();
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(opener);

    // An opener that has gone meanwhile gets nothing: focus is not forced anywhere.
    click(opener);
    await waitFor(() => host.querySelector("dialog")?.open);
    opener.remove();
    asking.set(false);
    expect(document.activeElement).not.toBe(opener);
    dispose();
  });

  test("takes its own label and class, and needs no message", () => {
    const { host, dispose } = render(() => (
      <ConfirmDialog title="Go?" confirmLabel="Go" confirmClass="primary" onconfirm={() => {}} oncancel={() => {}} />
    ));
    expect(host.querySelector("p")).toBeNull();
    expect(button(host, "Go")!.className).toBe("primary");
    dispose();
  });
});

describe("NewDialog", () => {
  test("asks for a name, keeps an error until the name changes, and goes away", async () => {
    const oncreate = mock(async (name: string) => (name === "taken" ? "taken.md already exists" : undefined));
    const oncancel = mock(() => {});
    const { host, dispose } = render(() => <NewDialog kind="page" oncreate={oncreate} oncancel={oncancel} />);
    const dialog = host.querySelector("dialog")!;
    await waitFor(() => dialog.open);

    const input = dialog.querySelector("input")!;
    expect(dialog.querySelector("h3")!.textContent).toBe("New page");
    expect(dialog.getAttribute("aria-labelledby")).toBe(dialog.querySelector("h3")!.id);
    expect(input.getAttribute("aria-label")).toBe("Name");
    expect(input.placeholder).toBe("my-page.md");

    submit(dialog.querySelector("form")!); // no name yet: nothing to create
    expect(oncreate).not.toHaveBeenCalled();
    type(input, "taken");
    submit(dialog.querySelector("form")!);
    await waitFor(() => dialog.querySelector(".dialog-error"));
    expect(dialog.querySelector(".dialog-error")!.textContent).toBe("taken.md already exists");
    expect(dialog.querySelector(".dialog-error")!.getAttribute("role")).toBe("alert");
    type(input, "fine");
    expect(dialog.querySelector(".dialog-error")).toBeNull();
    submit(dialog.querySelector("form")!);
    await settle();
    expect(oncreate).toHaveBeenLastCalledWith("fine");

    click(button(dialog, "Cancel")!);
    expect(oncancel).toHaveBeenCalled();
    dialog.close(); // Escape, say
    expect(oncancel.mock.calls.length).toBeGreaterThan(1);
    dispose();
  });

  test("names the kind it was opened for", async () => {
    const { host, dispose } = render(() => <NewDialog kind="stylesheet" oncreate={async () => {}} oncancel={() => {}} />);
    expect(host.querySelector("h3")!.textContent).toBe("New stylesheet");
    expect(host.querySelector("input")!.placeholder).toBe("poster.css");
    dispose();
  });
});

describe("resources", () => {
  afterEach(closeResource);

  test("a resource opens below the page, and the page stays where it is", async () => {
    expect(await loadFile("index.md")).toBe(true);
    expect(await openResource({ section: "static", path: "theme.css" })).toBe(true);

    expect(resource.peek()?.path).toBe("theme.css");
    expect(resourceDraft.peek()).toContain("--accent");
    expect(filePath.peek()).toBe("index.md");   // the content is untouched
    expect(showImages.peek()).toBe(false);      // the chooser got out of the way
    expect(resourceDirty.peek()).toBe(false);
  });

  test("editing marks it unsaved; saving writes it and clears that", async () => {
    await openResource({ section: "static", path: "theme.css" });
    resourceDraft.set(resourceDraft.peek() + "\n/* from the pane */\n");
    expect(resourceDirty.peek()).toBe(true);

    expect(await saveResource()).toBe(true);
    expect(resourceDirty.peek()).toBe(false);
    const onDisk = await (await fetch(`${BASE}/edit/static/theme.css`, { headers: { Accept: "text/plain" } })).text();
    expect(onDisk).toContain("from the pane");
  });

  test("templates open the same way", async () => {
    expect(await openResource({ section: "templates", path: "site.html" })).toBe(true);
    expect(resourceDraft.peek()).toContain("{{content}}");
  });

  test("closing leaves nothing behind, and a missing one opens nothing", async () => {
    await openResource({ section: "static", path: "theme.css" });
    closeResource();
    expect(resource.peek()).toBeNull();
    expect(resourceDraft.peek()).toBe("");

    expect(await openResource({ section: "static", path: "nope.css" })).toBe(false);
    hush(); // api() has spoken; the notice is asserted elsewhere
    expect(await saveResource()).toBe(false); // nothing open
    expect(await deleteResource()).toBe(false);
  });

  test("a new one is made with something to read, and opens straight away", async () => {
    expect(await createResource("templates", "made-up")).toBeUndefined();
    expect(resource.peek()).toEqual({ section: "templates", path: "made-up.html" });
    expect(resourceDraft.peek()).toContain("{{content}}");

    expect(await createResource("static", "made-up.css")).toBeUndefined();
    expect(resource.peek()?.path).toBe("made-up.css");
    expect(resourceDraft.peek()).toContain("css: made-up.css");

    expect(await createResource("static", "made-up")).toBe("made-up.css already exists");
    expect(await deleteResource()).toBe(true);
    expect(resource.peek()).toBeNull();
  });

});

describe("ResourceList", () => {
  afterEach(closeResource);

  test("lists templates, and picking one opens it below the page", async () => {
    const { host, dispose } = render(() => <ResourceList section="templates" />);
    await waitFor(() => rows(host).includes("site.html"));
    expect(host.querySelector(".pane-path")!.textContent).toBe("/templates");
    expect(rows(host)).not.toContain("favicon.ico");

    click(rowControl(host, "site.html"));
    await waitFor(() => resource.peek()?.path === "site.html");
    expect(resource.peek()?.section).toBe("templates");
    dispose();
  });

  test("the css tab lists the stylesheets in static/, and nothing else", async () => {
    await loadFile("guide/index.md");
    const { host, dispose } = render(() => <ResourceList section="static" />);
    await waitFor(() => rows(host).includes("theme.css"));
    expect(host.querySelector(".pane-path")!.textContent).toBe("/static");
    expect(rows(host)).toContain("theme.css");   // the site's own look
    expect(rows(host)).not.toContain("favicon.ico");
    dispose();
  });

  test("makes one from its header, and keeps the dialog open to say the name is taken", async () => {
    const { host, dispose } = render(() => <ResourceList section="static" />);
    await waitFor(() => rows(host).includes("theme.css"));

    const name = async (text: string) => {
      click(host.querySelector('[aria-label="New stylesheet"]')!);
      const dialog = host.querySelector("dialog")!;
      await waitFor(() => dialog.open);
      type(dialog.querySelector("input")!, text);
      submit(dialog.querySelector("form")!);
      return dialog;
    };

    const taken = await name("theme");
    await waitFor(() => taken.textContent!.includes("theme.css already exists"));
    click(button(taken, "Cancel")!);

    await name("from-the-list");
    await waitFor(() => resource.peek()?.path === "from-the-list.css");
    expect(host.querySelector("dialog")).toBeNull();
    await deleteResource();
    dispose();
  });

});

describe("ResourcePane", () => {
  afterEach(closeResource);

  test("names what is open, edits it, saves on ⌘⏎, and closes", async () => {
    await openResource({ section: "static", path: "poster.css" });
    const { host, dispose } = render(() => <ResourcePane />);
    expect(host.querySelector(".pane-name")!.textContent).toBe("poster.css");
    expect(host.querySelector(".lucide-droplet")).not.toBeNull();

    const area = host.querySelector("textarea")!;
    expect(area.getAttribute("aria-label")).toBe("Contents of poster.css");
    type(area, `${resourceDraft.peek()}\n/* pane */\n`);
    expect(resourceDirty.peek()).toBe(true);
    area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
    await waitFor(() => !resourceDirty.peek());
    expect(resourceSaved.peek()).toContain("/* pane */");

    area.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true })); // not a save
    click(host.querySelector('[aria-label="Close"]')!);
    expect(resource.peek()).toBeNull();
    dispose();
  });

  test("says so when the open template isn't the one the page is wearing", async () => {
    pageLayout.set("site.html");
    await openResource({ section: "templates", path: "post.html" });
    const { host, dispose } = render(() => <ResourcePane />);
    // when() renders on a microtask, not in the mount call.
    const note = () => host.querySelector(".pane-note");
    await waitFor(note);
    expect(note()!.textContent).toContain("uses site.html");

    // The one it does wear, and a stylesheet, say nothing.
    await openResource({ section: "templates", path: "site.html" });
    await waitFor(() => note() === null);
    await openResource({ section: "static", path: "poster.css" });
    await settle();
    expect(note()).toBeNull();

    // Nor does it guess before the preview has rendered anything.
    pageLayout.set("");
    await openResource({ section: "templates", path: "post.html" });
    await settle();
    expect(note()).toBeNull();
    dispose();
  });

  test("says nothing for a template reached only through {{include}}, not as the page's own layout", async () => {
    pageLayout.set("site.html");
    pageIncludes.set(["topbar.html"]);
    await openResource({ section: "templates", path: "topbar.html" });
    const { host, dispose } = render(() => <ResourcePane />);
    await settle();
    expect(host.querySelector(".pane-note")).toBeNull();

    // A template neither worn nor included still gets the note.
    pageIncludes.set([]);
    await openResource({ section: "templates", path: "topbar.html" });
    await waitFor(() => host.querySelector(".pane-note"));
    expect(host.querySelector(".pane-note")!.textContent).toContain("uses site.html");
    dispose();
  });

  test("shows a template's own icon, and deletes once confirmed", async () => {
    await createResource("templates", "pane-scratch");
    const { host, dispose } = render(() => <ResourcePane />);
    expect(host.querySelector(".lucide-layout-template")).not.toBeNull();

    click(host.querySelector('[aria-label="Delete pane-scratch.html"]')!);
    await waitFor(() => host.querySelector("dialog")?.open);
    expect(host.querySelector("dialog h3")!.textContent).toBe("Delete pane-scratch.html?");
    click(button(host.querySelector("dialog")!, "Cancel")!);
    expect(resource.peek()?.path).toBe("pane-scratch.html");

    click(host.querySelector('[aria-label="Delete pane-scratch.html"]')!);
    await waitFor(() => host.querySelector("dialog")?.open);
    click(button(host.querySelector("dialog")!, "Delete")!);
    await waitFor(() => resource.peek() === null);
    dispose();
  });
});

describe("Browser", () => {
  test("lists the site, walks folders, and opens files", async () => {
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rows(host).includes("index.md"));
    expect(rows(host)).toContain("guide");
    // Pages and folders, nothing else: everything a page is composed with
    // lives outside pages/ and is reached from Resources.
    expect(rows(host).some((r) => r.endsWith(".css"))).toBe(false);
    expect(row(host, "index.md").querySelector(".lucide-file-text")).not.toBeNull();

    // A folder is somewhere to be: the store's, so the trail says it too, and
    // the way back up is the trail's (there is no ".." row).
    click(rowControl(host, "guide"));
    await waitFor(() => rows(host).includes("pages.md"));
    expect(folder.get()).toBe("guide");
    expect(rows(host)).not.toContain("..");
    openFolder("");
    await waitFor(() => rows(host).includes("guide")); // guide/ has an index.md too: wait for the root

    // Every row is a button, so the tree is Tab and Enter; the open page says so.
    expect([...host.querySelectorAll(".file-list li")].every((li) => li.querySelector("button.row"))).toBe(true);
    click(rowControl(host, "index.md"));
    await waitFor(() => filePath.get() === "index.md");
    await waitFor(() => rowControl(host, "index.md").getAttribute("aria-current") === "page");
    expect(host.querySelectorAll("[aria-current]")).toHaveLength(1);
    dispose();
  });

  test("the two buttons make a page and a folder, and say when a name is taken", async () => {
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rows(host).includes("index.md"));
    const create = async (label: string, name: string) => {
      click(host.querySelector(`[aria-label="${label}"]`)!);
      const dialog = host.querySelector("dialog")!;
      await waitFor(() => dialog.open);
      type(dialog.querySelector("input")!, name);
      submit(dialog.querySelector("form")!);
      return dialog;
    };

    const taken = await create("New page", "index");
    await waitFor(() => taken.textContent!.includes("index.md already exists"));
    click(button(taken, "Cancel")!);
    expect(host.querySelector("dialog")).toBeNull();

    await create("New page", "browser-page");
    await waitFor(() => filePath.get() === "browser-page.md");
    expect(host.querySelector("dialog")).toBeNull();

    await create("New folder", "browser-folder");
    await waitFor(() => filePath.get() === "browser-folder/index.md");
    expect(editorContent.get()).toBe("title: browser-folder\n\n");
    dispose();
  });

  test("New collection makes a folder that is one, opens its index with the pane below, and a name taken says so", async () => {
    // A dot folder, so the site's walks (nav, search, export) never meet it.
    const FOLDER = ".browser-shots";
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rows(host).includes("index.md"));
    const create = async () => {
      click(host.querySelector('[aria-label="New collection"]')!);
      const dialog = host.querySelector("dialog")!;
      await waitFor(() => dialog.open);
      expect(dialog.querySelector("h3")!.textContent).toBe("New collection");
      type(dialog.querySelector("input")!, FOLDER);
      submit(dialog.querySelector("form")!);
      return dialog;
    };

    await create();
    await waitFor(() => filePath.get() === `${FOLDER}/index.md`);
    await waitFor(() => collection.get()?.folder === FOLDER);
    expect(host.querySelector("dialog")).toBeNull();
    expect(editorContent.get()).toBe(`title: ${FOLDER}\n\n{{items}}\n`);

    const read = async (name: string) => (await fetch(`/edit/pages/${FOLDER}/${name}`)).text();
    const data = await read("collection.json");
    expect(JSON.parse(data)).toEqual({
      fields: [
        { name: "src", kind: "image", label: "Picture" },
        { name: "title", label: "Title" },
        { name: "caption", kind: "long", label: "Caption" },
      ],
      images: { src: `/static/images/${FOLDER}/` },
      groups: [{ name: FOLDER, items: [] }],
    });
    expect(data).toStartWith('{\n  "fields": [');   // written the way the pane writes it
    expect(await read("item.md")).toStartWith("each: true\n");

    // Two works in it, and each is a page with its picture, title, caption
    // and the way to the next — the each: page doing its job.
    const made = JSON.parse(data);
    made.groups[0].items = [
      { src: "one.svg", title: "First Light", caption: "Ink on paper." },
      { src: "two.svg", title: "Second Wind", caption: "Oil on board." },
    ];
    await fetch(`/edit/pages/${FOLDER}/collection.json`, { method: "PUT", body: JSON.stringify(made) });
    const page = await (await nativeFetch(`${BASE}/${FOLDER}/first-light/`)).text();
    expect(page).toMatch(/<h1[^>]*>.*First Light.*<\/h1>/);
    expect(page).toContain(`src="/static/images/${FOLDER}/one.svg"`);
    expect(page).toContain("Ink on paper.");
    expect(page).toContain(`href="/${FOLDER}/second-wind/"`);

    // Its index opened, so the tree is in the new folder now; back up to ask again.
    expect(folder.get()).toBe(FOLDER);
    openFolder("");
    await waitFor(() => rows(host).includes("guide"));   // the top (a dot folder isn't listed)
    const taken = await create();
    await waitFor(() => taken.textContent!.includes(`${FOLDER}/collection.json already exists`));
    click(button(taken, "Cancel")!);
    closeCollection();
    dispose();
  });

  test("a listing that fails speaks and leaves the list as it was", async () => {
    const restore = intercept(() => new Response("boom", { status: 500 }));
    try {
      const { host, dispose } = render(() => <Browser />);
      await waitFor(() => notice.get());
      expect(notice.get()).toBe("Couldn't list /: 500 boom");
      expect(rows(host)).toEqual([]);
      dispose();
    } finally {
      restore();
    }
  });
});

describe("createCollection", () => {
  afterEach(() => { closeCollection(); closeResource(); });
  const read = async (key: string) => (await fetch(`/edit/pages/${key}`)).text();

  test("keeps a folder's own index, says when item.md is already a page, and takes the slot below the page", async () => {
    await fetch("/edit/pages/.made/index.md", { method: "PUT", body: "title: Mine\n" });
    await fetch("/edit/pages/.made/item.md", { method: "PUT", body: "title: Not an each: page\n" });
    // With a resource open below, opening the index doesn't offer the
    // collection — but a collection just asked for takes the slot anyway.
    await openResource({ section: "static", path: "poster.css" });

    expect(await createCollection("", "/.made/")).toBeUndefined();
    expect(notice.get()).toBe(`.made/item.md was already a page, so .made's works have no pages of their own yet — `
      + `give one page in .made the line "each: true"`);
    expect(await read(".made/index.md")).toBe("title: Mine\n");
    expect(await read(".made/item.md")).toBe("title: Not an each: page\n");
    expect(filePath.get()).toBe(".made/index.md");
    expect(collection.get()).toEqual({ folder: ".made" });
    expect(resource.get()).toBeNull();
  });

  test("inside a folder, under a name with a space in it", async () => {
    expect(await createCollection(".made", "Old Shots")).toBeUndefined();
    const data = JSON.parse(await read(".made/Old%20Shots/collection.json"));
    expect(data.images.src).toBe("/static/images/.made/Old%20Shots/");
    expect(data.groups[0].name).toBe("Old Shots");
    expect(await read(".made/Old%20Shots/item.md")).toStartWith("each: true\n");
    expect(collection.get()).toEqual({ folder: ".made/Old Shots" });
  });

  test("a name that is no folder, and a failure it doesn't expect", async () => {
    expect(await createCollection("", "/")).toBe("A collection is a folder: give it a name");
    const restore = intercept(() => new Response("boom", { status: 500 }));
    try {
      expect(await createCollection("", ".never")).toBe("Couldn't create .never/collection.json");
      expect(notice.get()).toBe("Couldn't create .never/collection.json: 500 boom");
    } finally {
      restore();
    }
  });
});

describe("Editor", () => {
  test("saves, flags a save that failed, and saves on ⌘⏎ only when there's something to save", async () => {
    await createFile("/editor-test.md", "editor-test.md");
    const { host, dispose } = render(() => <Editor />);
    const area = host.querySelector("textarea")!;
    const save = button(host, "Save")!;
    expect(host.querySelector(".pane-header .pane-name")!.textContent).toBe("editor-test.md");
    expect(area.getAttribute("aria-label")).toBe("Contents of editor-test.md");
    expect(area.value).toBe("title: editor-test\n\n");

    const status = host.querySelector('.pane-header [role="status"]')!;
    expect(status.textContent).toBe("");
    expect(host.querySelector(".pane-header .dot")).toBeNull();
    type(area, "title: editor-test\n\n# Edited");
    expect(save.className).toBe("primary"); // dirty
    // Unsaved, as a picture a screen reader can name, not "black circle".
    const dot = host.querySelector(".pane-header .dot")!;
    expect(dot.getAttribute("role")).toBe("img");
    expect(dot.getAttribute("aria-label")).toBe("Unsaved changes");
    click(save);
    await waitFor(() => save.textContent!.includes("Saved"));
    expect(save.className).toBe("saved");
    expect(status.textContent).toBe("Saved"); // said, as well as shown
    expect(fileContent.get()).toBe("title: editor-test\n\n# Edited");
    await waitFor(() => save.textContent!.includes("Save") && !save.textContent!.includes("Saved"), 2500);
    expect(save.className).toBe("");

    type(area, "title: editor-test\n\n# Unsaved");
    const restore = intercept(() => new Response("disk full", { status: 507 }));
    try {
      click(save);
      await waitFor(() => save.textContent!.includes("Not saved"));
      expect(save.className).toBe("danger");
      expect(status.textContent).toBe("Not saved");
      expect(notice.get()).toBe("Couldn't save editor-test.md: 507 disk full");
    } finally {
      restore();
    }

    area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
    await waitFor(() => fileContent.get() === "title: editor-test\n\n# Unsaved");

    const put = spyOn(globalThis, "fetch");
    area.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true })); // clean: nothing to save
    area.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true }));
    await settle();
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
    dispose();
  });

  test("deletes only once confirmed", async () => {
    await createFile("/editor-delete.md", "editor-delete.md");
    const { host, dispose } = render(() => <Editor />);
    const trash = host.querySelector('[aria-label="Delete editor-delete.md"]')!;
    click(trash);
    await waitFor(() => host.querySelector("dialog")?.open);
    expect(host.querySelector("dialog h3")!.textContent).toBe("Delete editor-delete.md?");
    click(button(host.querySelector("dialog")!, "Cancel")!);
    expect(host.querySelector("dialog")).toBeNull();
    expect(filePath.get()).toBe("editor-delete.md");

    click(trash);
    await waitFor(() => host.querySelector("dialog")?.open);
    click(button(host.querySelector("dialog")!, "Delete")!);
    await waitFor(() => filePath.get() === null);
    dispose();
  });

  // n109
  test("renames or moves the page, unsaved changes and all, and tells the address it kept", async () => {
    await createFile("/editor-move.md", "editor-move.md");
    const { host, dispose } = render(() => <Editor />);
    type(host.querySelector("textarea")!, "title: editor-move\n\n# Changed");
    const rename = host.querySelector('[aria-label="Rename or move editor-move.md"]')!;
    click(rename);                                             // asked, and thought better of
    await waitFor(() => host.querySelector("dialog")?.open);
    click(button(host.querySelector("dialog")!, "Cancel")!);
    expect(host.querySelector("dialog")).toBeNull();
    click(rename);
    const dialog = host.querySelector("dialog")!;
    await waitFor(() => dialog.open);
    expect(dialog.querySelector("h3")!.textContent).toBe("Rename or move editor-move.md");
    const input = dialog.querySelector("input")!;
    expect(input.value).toBe("editor-move.md");
    expect(button(dialog, "Move")).toBeDefined();

    submit(dialog.querySelector("form")!);                   // where it is already
    await waitFor(() => dialog.querySelector(".dialog-error"));
    expect(dialog.querySelector(".dialog-error")!.textContent).toBe("It is already editor-move.md");

    type(input, "moved/editor-moved");                       // .md is added
    submit(dialog.querySelector("form")!);
    await waitFor(() => filePath.get() === "moved/editor-moved.md");
    expect(host.querySelector("dialog")).toBeNull();
    expect(editorContent.get()).toBe("title: editor-move\naliases: /editor-move.html\n\n# Changed");
    expect(button(host, "Save")!.className).toBe("");        // it was saved on the way
    expect(news.get()).toBe(true);
    expect(notice.get()).toBe("editor-move.md is now moved/editor-moved.md; /editor-move.html still answers, and leads there");
    await deleteFile();
    dispose();
  });

  test("a move that doesn't happen says why, in the dialog", async () => {
    expect(await moveFile("anywhere")).toBeUndefined();        // nothing open, nothing to move
    await createFile("/editor-stay.md", "editor-stay.md");
    expect(await moveFile("index.md")).toBe("index.md already exists");
    await loadFile("gallery/item.md");
    expect(await moveFile("gallery/work.md"))
      .toBe("gallery/item.md is the page every item of its collection gets, and stays with the collection");

    await loadFile("editor-stay.md");
    let restore = intercept(() => new Response("broken", { status: 500 }));
    try {
      expect(await moveFile("elsewhere")).toBe("Couldn't move editor-stay.md");
      expect(notice.get()).toBe("Couldn't move editor-stay.md: 500 broken");
      editorContent.set("title: changed");
      expect(await moveFile("elsewhere")).toBe("Couldn't save editor-stay.md first");
    } finally {
      restore();
    }
    // A draft had no address, so there is none to tell of.
    editorContent.set("title: S\ndraft: true\n");
    expect(await moveFile("editor-stayed")).toBeUndefined();
    expect(notice.get()).toBe("editor-stay.md is now editor-stayed.md");
    await deleteFile();
  });

  test("opening another file clears the unsaved flag", async () => {
    await loadFile("index.md");
    const { host, dispose } = render(() => <Editor />);
    type(host.querySelector("textarea")!, "changed");
    expect(button(host, "Save")!.className).toBe("primary");
    await loadFile("guide/index.md");
    expect(button(host, "Save")!.className).toBe("");
    dispose();
  });
});

describe("Preview", () => {
  const frame = (host: HTMLElement) => host.querySelector("iframe") as HTMLIFrameElement;

  test("renders as you type, sandboxed, styled by the site and the theme cascade the page will get", async () => {
    batch(() => {
      filePath.set("My folder/page.md");
      editorContent.set("title: Typed\ntheme: dark\n\n# Hi");
    });
    const { host, dispose } = render(() => <Preview />);
    expect(frame(host).getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame(host).title).toBe("Preview of the page");
    editorContent.set("title: Typed\ntheme: dark\n\n# Hello [[other]]"); // within the debounce: replaces the first
    await waitFor(() => frame(host).srcdoc.includes("Hello"));
    const doc = frame(host).srcdoc;
    expect(doc).toContain("<title>Typed</title>");
    expect(doc).toContain('<link href="/static/site.css" rel="stylesheet">');
    expect(doc).toContain('<link href="/static/theme.css" rel="stylesheet">'); // the site's look, as the template links it
    expect(doc).toContain('href="/My%20folder/other.html"'); // the wiki link, from where the page lives
    dispose();
  });

  // n110
  test("says a link leads nowhere, once, and takes it down when the link is put right", async () => {
    batch(() => {
      filePath.set("blog/linked.md");
      editorContent.set("[gone](/nowhere.html)");
    });
    const { host, dispose } = render(() => <Preview />);
    const said = "Links that lead nowhere a reader can go: /nowhere.html";
    await waitFor(() => notice.get() === said);
    expect(news.get()).toBe(false);                               // a failure, not news
    editorContent.set("[gone](/nowhere.html) and more words");   // still broken: said once, not again
    await waitFor(() => frame(host).srcdoc.includes("more words"));
    expect(notice.get()).toBe(said);
    editorContent.set("[home](/)");
    await waitFor(() => notice.get() === "");

    // Something else said since is left alone: only its own line comes down.
    editorContent.set("[gone](/nowhere.html)");
    await waitFor(() => notice.get() === said);
    speak("Couldn't save something else");
    editorContent.set("[home](/) again");
    await waitFor(() => frame(host).srcdoc.includes("again"));
    expect(notice.get()).toBe("Couldn't save something else");
    dispose();
  });

  test("with no file open, a bare page gets the defaults and the root theme", async () => {
    editorContent.set("Just text");
    const { host, dispose } = render(() => <Preview />);
    await waitFor(() => frame(host).srcdoc.includes("Just text"));
    expect(frame(host).srcdoc).toContain('<link href="/static/theme.css" rel="stylesheet">');
    expect(frame(host).srcdoc).toContain("<title>duckie</title>"); // the site's default title
    dispose();
  });

  test("a template being edited is what the page is shown in, and its own css wins", async () => {
    batch(() => {
      filePath.set("index.md");
      editorContent.set("title: Typed\n\n# Hi");
    });
    const { host, dispose } = render(() => <Preview />);
    await waitFor(() => frame(host).srcdoc.includes("Hi"));
    expect(pageLayout.get()).toBe("site.html");

    // The template, unsaved: the preview goes back to the server for it,
    // because only the server can put the page through a template.
    await openResource({ section: "templates", path: "site.html" });
    resourceDraft.set("<html><head></head><body><h9>from the pane</h9>{{content}}</body></html>");
    await waitFor(() => frame(host).srcdoc.includes("from the pane"));
    expect(frame(host).srcdoc).toContain('<h1 id="hi">');
    closeResource();
    await waitFor(() => !frame(host).srcdoc.includes("from the pane"));

    // A stylesheet, unsaved: no round trip at all — it goes into the head.
    await openResource({ section: "static", path: "poster.css" });
    resourceDraft.set("body { color: fuchsia }");
    await waitFor(() => frame(host).srcdoc.includes("fuchsia"));
    expect(frame(host).srcdoc).toContain("<style>body { color: fuchsia }</style></head>");
    closeResource();
    dispose();
  });

  test("shows nothing for an empty page, and a render that fails speaks", async () => {
    const { host, dispose } = render(() => <Preview />);
    await settle(350);
    expect(frame(host).srcdoc).toBe("");
    const restore = intercept(() => new Response("boom", { status: 500 }));
    try {
      editorContent.set("# Hi");
      await waitFor(() => notice.get());
      expect(notice.get()).toBe("Couldn't render the preview: 500 boom");
      expect(frame(host).srcdoc).toBe("");
    } finally {
      restore();
    }
    dispose();
  });
});

describe("CssPreview", () => {
  test("shows the CSS on sample content, on a body with no class of its own", () => {
    editorContent.set(":root { --accent: red }");
    const { host, dispose } = render(() => <CssPreview css={() => editorContent.get()} />);
    const frame = () => (host.querySelector("iframe") as HTMLIFrameElement).srcdoc;
    expect(frame()).toContain("<style>:root { --accent: red }</style>");
    // No page wears a class, so neither does the preview's body: a class here
    // would style sample content the way no real page is ever styled.
    expect(frame()).toContain("<body>");
    editorContent.set("p { margin: 0 }");
    expect(frame()).toContain("<style>p { margin: 0 }</style>");
    dispose();
  });
});

describe("Header", () => {
  test("links View to the open page, opens the resources, and logs out by POST", () => {
    const { host, dispose } = render(() => <Header />);
    const view = [...host.querySelectorAll("a")].find((a) => a.textContent!.includes("View"))!;
    expect(view.getAttribute("href")).toBe("/");
    filePath.set("My folder/a b.md");
    expect(view.getAttribute("href")).toBe("/My%20folder/a%20b.html");
    const resources = button(host, "Resources")!;
    expect(resources.getAttribute("aria-expanded")).toBe("false");
    click(resources);
    expect(showImages.get()).toBe(true);
    expect(resources.getAttribute("aria-expanded")).toBe("true");
    const logout = host.querySelector("form.header-form") as HTMLFormElement;
    expect(logout.getAttribute("method")).toBe("post");
    expect(logout.getAttribute("action")).toBe("/logout");
    dispose();
  });
});

// n134: the bento's frame
describe("Trail", () => {
  const crumbs = (host: ParentNode) => [...host.querySelectorAll(".crumb")].map((c) => c.textContent!.trim());
  const here = (host: ParentNode) => host.querySelector("[aria-current=location]")!.textContent;

  test("says where you are once: the site, the folders, the page; every crumb but the last goes there", async () => {
    const { host, dispose } = render(() => <Trail />);
    // A list redraws on a microtask, as when() does: wait for what it says.
    const says = (...want: string[]) => waitFor(() => crumbs(host).join(" › ") === want.join(" › "));
    await says("duckie");
    expect(here(host)).toBe("duckie");

    await loadFile("guide/pages.md");                    // the tree goes where the page is
    expect(folder.get()).toBe("guide");
    await says("duckie", "guide", "pages.md");
    expect(here(host)).toBe("pages.md");
    expect(shortName("guide/pages.md")).toBe("pages.md");  // the pane says the name the trail hasn't

    openFolder("guide/deeper/still");                      // a folder the page isn't in
    await says("duckie", "guide", "deeper", "still");
    expect(shortName("guide/pages.md")).toBe("guide/pages.md");
    click(button(host, "deeper")!);
    expect(folder.get()).toBe("guide/deeper");
    await says("duckie", "guide", "deeper");
    click(button(host, "guide")!);
    expect(folder.get()).toBe("guide");
    await says("duckie", "guide", "pages.md");
    click(button(host, "duckie")!);
    expect(folder.get()).toBe("");
    await says("duckie");
    dispose();
  });

  test("a drawer's folders say where they are the same way, from their own top", () => {
    const went: string[] = [];
    const crumbs = folderCrumbs("images", "a/b/c", (to) => went.push(to));
    expect(crumbs.map((c) => c.label)).toEqual(["images", "a", "b", "c"]);
    for (const c of crumbs) c.go!();
    expect(went).toEqual(["", "a", "a/b", "a/b/c"]);
  });

  test("one drawer at a time: choosing another takes the first one's place", () => {
    toggleDrawer("editors");
    expect(drawer.get()).toBe("editors");
    toggleImages();
    expect(drawer.get()).toBe("resources");
    expect(showImages.get()).toBe(true);
    toggleDrawer("resources");
    expect(drawer.get()).toBeNull();
  });
});

// n115, n116
describe("Publish", () => {
  // The server under test has no remote; these stand in for one, and let
  // everything else through to it.
  function remote(answers: { status?: () => Response; publish?: () => Response; pull?: () => Response }) {
    const seen: string[] = [];
    const restore = intercept((url, init) => {
      if (!url.startsWith("/edit/publish")) return signedIn(url, init);
      const which = url.includes("?pull") ? "pull" : init?.method === "POST" ? "publish" : "status";
      seen.push(which);
      return answers[which]!();
    });
    return { seen, restore };
  }
  const status = (over: object = {}) => () => Response.json({
    remote: "git origin/main", changes: [{ path: "pages/a.md", state: "changed" }, { path: "pages/b.md", state: "added" }], ahead: 1, behind: 2, ...over,
  });

  test("no remote, no button", async () => {
    publishState.set({ remote: "x", changes: [], ahead: 0, behind: 0 });
    await refreshPublish();                                             // the real server: 404
    expect(publishState.get()).toBeNull();
    const { host, dispose } = render(() => <Header />);
    await settle(450);
    expect(button(host, "Publish")).toBeUndefined();
    dispose();
  });

  test("says what's waiting, publishes it with what the checks found, and pulls in what was published elsewhere", async () => {
    const r = remote({
      status: status(),
      publish: () => Response.json({ committed: true, pushed: 2, problems: ["broken link: index.html -> /gone.html"] }),
      pull: () => Response.json({ changed: ["pages/index.md"], conflicts: ["pages/a.md"] }),
    });
    try {
      await loadFile("index.md");
      const { host, dispose } = render(() => <div><PublishButton /><Drawers /></div>);
      await waitFor(() => button(host, "Publish"));
      expect(host.querySelector(".badge")!.textContent).toBe("3");       // two changes, one commit waiting
      click(button(host, "Publish")!);
      // A drawer, not a modal: the page stays in view and in reach behind it.
      await waitFor(() => host.querySelector(".sidebar"));
      expect(button(host, "Publish")!.getAttribute("aria-expanded")).toBe("true");
      const dialog = host.querySelector(".sidebar")!;
      expect(dialog.querySelector("h3")!.textContent).toBe("Publish to git origin/main");
      expect([...dialog.querySelectorAll(".history-list li")].map((li) => li.textContent)).toEqual(["pages/a.mdchanged", "pages/b.mdnew"]);
      expect(dialog.textContent).toContain("1 commit(s) made here, not yet published.");
      expect(dialog.textContent).toContain("The published site has 2 change(s) this copy hasn't: Pull first.");

      const form = dialog.querySelector("form.editor-add") as HTMLFormElement;
      (form.elements.namedItem("message") as HTMLInputElement).value = "A change";
      submit(form);
      await waitFor(() => notice.get() === "Published: 2 commit(s) pushed");
      expect(dialog.textContent).toContain("Published, but the export found these");
      expect(dialog.textContent).toContain("broken link: index.html -> /gone.html");

      click(button(dialog, "Pull")!);
      await waitFor(() => notice.get() === "Pulled 1 change(s) from the published site");
      expect(dialog.textContent).toContain("Changed here and there — yours is kept");
      expect(dialog.textContent).toContain("pages/a.md");
      expect(r.seen).toContain("pull");

      click(dialog.querySelector('[aria-label="Close publish"]')!);
      expect(host.querySelector(".sidebar")).toBeNull();
      dispose();
    } finally {
      r.restore();
    }
  });

  test("a refusal is said in the drawer; nothing waiting is said too, and Publish waits", async () => {
    let answer = status({ changes: [], ahead: 0, behind: 0, problem: "This branch has no upstream to publish to: push it once with git push -u" });
    const r = remote({
      status: () => answer(),
      publish: () => new Response("The published site has changes this copy hasn't: Pull, then Publish again", { status: 409 }),
      pull: () => Response.json({ changed: [], conflicts: [] }),
    });
    try {
      const { host, dispose } = render(() => <div><PublishButton /><Drawers /></div>);
      await refreshPublish();
      await waitFor(() => button(host, "Publish"));
      expect(host.querySelector(".badge")).toBeNull();
      click(button(host, "Publish")!);
      await waitFor(() => host.querySelector(".sidebar")?.textContent!.includes("no upstream"));
      const dialog = host.querySelector(".sidebar")!;
      expect(dialog.textContent).toContain("Nothing here that isn't published.");
      expect(button(dialog.querySelector("form")!, "Publish")!.disabled).toBe(true);
      click(button(dialog, "Pull")!);
      await waitFor(() => notice.get() === "Nothing new to pull");

      answer = status();
      await refreshPublish();
      submit(dialog.querySelector("form")!);
      await waitFor(() => dialog.querySelector(".dialog-error")?.textContent!.includes("Pull, then Publish again"));

      // Why the status can't be known at all, and a pull where every change collided.
      answer = () => new Response("/x isn't in a git repository, so DUCKDOWN_REMOTE=git has nowhere to push", { status: 409 });
      await refreshPublish();
      await waitFor(() => dialog.textContent!.includes("isn't in a git repository"));
      dispose();
    } finally {
      r.restore();
    }
    drawer.set(null);                                   // the first button's drawer, still open
    const collided = remote({ status: status(), pull: () => Response.json({ changed: [], conflicts: ["pages/a.md"] }), publish: () => Response.json({ committed: false, pushed: 0, problems: [] }) });
    try {
      const { host, dispose } = render(() => <div><PublishButton /><Drawers /></div>);
      await waitFor(() => button(host, "Publish"));
      click(button(host, "Publish")!);
      await waitFor(() => host.querySelector(".sidebar"));
      click(button(host.querySelector(".sidebar")!, "Pull")!);
      await waitFor(() => notice.get() === "Pulled: everything that changed there was changed here too");
      submit(host.querySelector(".sidebar form")!);
      await waitFor(() => notice.get() === "Nothing to publish");
      dispose();
    } finally {
      collided.restore();
      publishState.set(null);
    }
  });
});

// n113
describe("EditorsDrawer", () => {
  const drawerOf = (host: HTMLElement) => host.querySelector(".sidebar") as HTMLElement | null;
  const names = (host: HTMLElement) => [...host.querySelectorAll(".editor-row .history-label")].map((e) => e.textContent);
  const fill = (form: HTMLFormElement, values: Record<string, string>) => {
    for (const [name, value] of Object.entries(values)) (form.elements.namedItem(name) as HTMLInputElement).value = value;
    submit(form);
  };
  // Stage an answer for /edit/users alone. The Header's Publish button asks
  // for its status 400ms after it appears, and an answer staged for every
  // request handed it {ok: true} as a status whenever the two met.
  const users = (respond: () => Response) =>
    intercept((url, init) => (url.startsWith("/edit/users") ? respond() : signedIn(url, init)));

  test("opens from the header: adds an editor, sets a password, removes one, and says what the server refused", async () => {
    const { host, dispose } = render(() => <div><Header /><Drawers /></div>);
    const opener = button(host, "Editors")!;
    opener.focus();
    click(opener);
    await waitFor(() => names(host).includes("admin"));
    const drawer = drawerOf(host)!;
    expect(drawer.querySelector("h3")!.textContent).toBe("Editors");
    expect(opener.getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => document.activeElement === drawer);           // it takes focus
    expect(drawer.querySelectorAll(".editor-row .face")[0]!.textContent).toBe("A");
    const admin = [...host.querySelectorAll(".editor-row")].find((r) => r.textContent!.includes("admin"))!;
    expect(admin.textContent).toContain("you");
    expect(admin.querySelector('[aria-label="Remove admin"]')).toBeNull();     // not yourself

    const add = host.querySelector("form.editor-add") as HTMLFormElement;
    fill(add, { name: "eve", password: "short" });
    await waitFor(() => host.querySelector(".dialog-error"));
    expect(host.querySelector(".dialog-error")!.textContent).toBe("A password is at least 8 characters");
    fill(add, { name: "eve", password: "eve's password" });
    await waitFor(() => names(host).includes("eve"));
    expect(notice.get()).toBe("eve can sign in");
    expect(host.querySelector(".dialog-error")).toBeNull();

    // Another's password: no current one asked for; Cancel closes the line.
    click(host.querySelector('[aria-label="Set eve\'s password"]')!);
    let line = host.querySelector("form.editor-password") as HTMLFormElement;
    expect(line.elements.namedItem("current")).toBeNull();
    click(button(line, "Cancel")!);
    expect(host.querySelector("form.editor-password")).toBeNull();
    click(host.querySelector('[aria-label="Set eve\'s password"]')!);
    fill(host.querySelector("form.editor-password") as HTMLFormElement, { password: "eve's new password" });
    await waitFor(() => notice.get().startsWith("eve's password changed"));
    expect(host.querySelector("form.editor-password")).toBeNull();

    // Your own: the one you have now, first.
    click(host.querySelector('[aria-label="Set admin\'s password"]')!);
    line = host.querySelector("form.editor-password") as HTMLFormElement;
    fill(line, { current: "not it", password: "a new password" });
    await waitFor(() => host.querySelector(".dialog-error"));
    expect(host.querySelector(".dialog-error")!.textContent).toBe("That isn't your current password");
    const restore = users(() => Response.json({ ok: true }));              // a change that worked, without changing it
    try {
      fill(line, { current: "admin", password: "a new password" });
      await waitFor(() => notice.get().startsWith("Your password changed"));
    } finally {
      restore();
    }

    // Removing asks first.
    click(host.querySelector('[aria-label="Remove eve"]')!);
    await waitFor(() => host.querySelector("dialog"));
    click(button(host.querySelector("dialog")!, "Cancel")!);
    expect(names(host)).toContain("eve");
    click(host.querySelector('[aria-label="Remove eve"]')!);
    await waitFor(() => host.querySelector("dialog"));
    click(button(host.querySelector("dialog")!, "Remove")!);
    await waitFor(() => !names(host).includes("eve"));
    expect(notice.get()).toBe("eve can't sign in any more");

    // A failure nobody explained speaks on the line, and changes nothing here.
    const broken = users(() => new Response("disk full", { status: 507 }));
    try {
      fill(add, { name: "fay", password: "fay's password" });
      await waitFor(() => notice.get() === "Couldn't add fay: 507 disk full");
    } finally {
      broken();
    }

    // Escape closes it, and focus goes back to the button that opened it.
    drawer.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(drawerOf(host)).not.toBeNull();
    drawer.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(drawerOf(host)).toBeNull();
    expect(document.activeElement).toBe(opener);
    dispose();
  });

  test("the environment's admin can't be changed here, so it offers nothing to change", async () => {
    await fetch("/edit/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "gus", password: "gus's password" }) });
    process.env.DUCKDOWN_ADMIN_PASSWORD = "x";
    process.env.DUCKDOWN_ADMIN_USER = "gus";
    try {
      const { host, dispose } = render(() => <EditorsDrawer />);
      await waitFor(() => names(host).includes("gus"));
      const gus = [...host.querySelectorAll(".editor-row")].find((r) => r.textContent!.includes("gus"))!;
      expect(gus.textContent).toContain("set by the environment");
      expect(gus.querySelector("button")).toBeNull();
      dispose();
    } finally {
      delete process.env.DUCKDOWN_ADMIN_PASSWORD;
      delete process.env.DUCKDOWN_ADMIN_USER;
    }
  });
});

describe("ImageBrowser", () => {
  test("browses, previews, copies, makes folders, uploads, and closes", async () => {
    const writeText = mock((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { host, dispose } = render(() => <ImageBrowser />);
    await waitFor(() => rows(host).includes("logo.svg"));
    // Pictures drawn as pictures: a grid of them, big enough to tell apart.
    expect(row(host, "logo.svg").closest(".file-list.pictures")).not.toBeNull();
    expect(row(host, "logo.svg").querySelector("img")!.getAttribute("src")).toBe("/edit/browse/logo.svg?thumb=160");

    expect(rowControl(host, "logo.svg").getAttribute("aria-pressed")).toBe("false");
    click(rowControl(host, "logo.svg"));
    await waitFor(() => host.querySelector(".image-preview"));
    expect(rowControl(host, "logo.svg").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".image-preview img")!.getAttribute("src")).toBe("/static/images/logo.svg");
    click(button(host, "Copy Markdown")!);
    expect(writeText).toHaveBeenCalledWith("![logo.svg](/static/images/logo.svg)");
    writeText.mockImplementation(() => Promise.reject(new Error("denied")));
    click(button(host, "Copy Markdown")!);
    await waitFor(() => notice.get());
    expect(notice.get()).toBe("Couldn't copy to the clipboard: the browser refused.");

    // A folder: an empty name makes nothing; a name makes it and opens it
    const newFolder = async (name: string) => {
      click(host.querySelector('[aria-label="New folder"]')!);
      const dialog = host.querySelector("dialog")!;
      await waitFor(() => dialog.open);
      if (name) type(dialog.querySelector("input")!, name);
      submit(dialog.querySelector("form")!);
      return dialog;
    };
    await newFolder("");
    expect(host.querySelector("dialog")).toBeNull();
    await newFolder("My shots");
    // Where you are among the images is a small trail of its own.
    await waitFor(() => trailOf(host.querySelector(".browser-header")!) === "images › My shots");

    // Upload into it: nothing chosen does nothing; a file lands and is listed
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    // Out of sight but not display:none, which would take it out of the tab order.
    expect(input.className).toBe("visually-hidden");
    expect(input.closest("label")!.textContent).toContain("Upload");
    Object.defineProperty(input, "files", { value: [], configurable: true });
    input.dispatchEvent(new Event("change"));
    Object.defineProperty(input, "files", { value: [new File(["<svg/>"], "a b.svg", { type: "image/svg+xml" })], configurable: true });
    input.dispatchEvent(new Event("change"));
    await waitFor(() => rows(host).includes("a b.svg"));
    expect(row(host, "a b.svg").querySelector("img")!.getAttribute("src")).toBe("/edit/browse/My%20shots/a%20b.svg?thumb=160");
    click(rowControl(host, "a b.svg"));
    await waitFor(() => host.querySelector(".image-preview"));
    expect(host.querySelector(".image-preview img")!.getAttribute("src")).toBe("/static/images/My%20shots/a%20b.svg");

    expect(rows(host)).not.toContain("..");
    click(button(host.querySelector(".browser-header .trail")!, "images")!);
    await waitFor(() => rows(host).includes("My shots"));
    click(rowControl(host, "My shots"));
    await waitFor(() => rows(host).includes("a b.svg"));

    click(host.querySelector('[aria-label="Close resources"]')!);
    expect(showImages.get()).toBe(false);
    dispose();
  });

  test("four tabs over one sidebar: images, css, templates, reports", async () => {
    const { host, dispose } = render(() => <ImageBrowser />);
    await waitFor(() => rows(host).includes("logo.svg"));
    const tab = (name: string) => button(host.querySelector(".browser-sections")!, name)!;
    expect(tab("images").className).toBe("section on");
    // Tabs to a screen reader: the chosen one selected, the only one Tab reaches,
    // and naming the panel under them.
    const list = host.querySelector('[role="tablist"]')!;
    expect(list.getAttribute("aria-label")).toBe("Resources");
    expect(tab("images").getAttribute("aria-selected")).toBe("true");
    expect(tab("css").getAttribute("aria-selected")).toBe("false");
    expect(tab("images").getAttribute("tabindex")).toBe("0");
    expect(tab("css").getAttribute("tabindex")).toBe("-1");
    expect(host.querySelector('[role="tabpanel"]')!.getAttribute("aria-labelledby")).toBe("tab-images");
    // The arrows move along them, round the ends; Home and End go to the ends.
    const press = (key: string) => list.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    press("ArrowLeft");
    expect(tab("reports").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab("reports"));
    press("ArrowRight");
    expect(tab("images").getAttribute("aria-selected")).toBe("true");
    press("End");
    expect(tab("reports").getAttribute("aria-selected")).toBe("true");
    press("Home");
    expect(tab("images").getAttribute("aria-selected")).toBe("true");
    press("a");                                         // any other key is the page's
    expect(tab("images").getAttribute("aria-selected")).toBe("true");
    await waitFor(() => rows(host).includes("logo.svg"));

    click(tab("css"));
    await waitFor(() => rows(host).includes("theme.css"));
    expect(tab("css").className).toBe("section on");
    expect(tab("images").className).toBe("section");
    expect(host.querySelector(".upload-area")).toBeNull(); // the images tab stepped aside

    click(tab("templates"));
    await waitFor(() => rows(host).includes("site.html"));
    expect(host.querySelector(".pane-path")!.textContent).toBe("/templates");

    // Reports: nothing yet says so; a month is a folder, newest first, and a
    // report is a link to its own tab — for reading, not for the editor.
    click(tab("reports"));
    await waitFor(() => host.textContent!.includes("nothing here yet"));
    for (const month of ["2026-08", "2026-09"]) mkdirSync(join(SITE, "reports", month), { recursive: true });
    writeFileSync(join(SITE, "reports", "2026-09", "2026-09-23.md"), "# 23rd\n");
    writeFileSync(join(SITE, "reports", "2026-09", "2026-09-24.md"), "# 24th\n");
    writeFileSync(join(SITE, "reports", "2026-09", "data.json"), "{}");
    click(tab("css"));
    click(tab("reports"));
    await waitFor(() => rows(host).includes("2026-09"));
    expect(rows(host)).toEqual(["2026-09", "2026-08"]);
    click(rowControl(host, "2026-09"));
    await waitFor(() => rows(host).includes("2026-09-24.md"));
    expect(rows(host)).toEqual(["2026-09-24.md", "2026-09-23.md"]);
    expect(trailOf(host.querySelector(".browser-header")!)).toBe("reports › 2026-09");
    const link = row(host, "2026-09-24.md").querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/edit/reports/2026-09/2026-09-24.md");
    expect(link.getAttribute("target")).toBe("_blank");
    click(button(host.querySelector(".browser-header .trail")!, "reports")!);   // and back up to the months
    await waitFor(() => rows(host).includes("2026-08"));
    expect(rows(host)).toEqual(["2026-09", "2026-08"]);
    rmSync(join(SITE, "reports"), { recursive: true, force: true });

    click(tab("images"));
    await waitFor(() => rows(host).includes("logo.svg"));
    dispose();
  });

  test("the folder dialog cancels, and a folder that can't be made speaks", async () => {
    const { host, dispose } = render(() => <ImageBrowser />);
    await waitFor(() => rows(host).includes("logo.svg"));
    click(host.querySelector('[aria-label="New folder"]')!);
    let dialog = host.querySelector("dialog")!;
    await waitFor(() => dialog.open);
    click(button(dialog, "Cancel")!);
    expect(host.querySelector("dialog")).toBeNull();

    click(host.querySelector('[aria-label="New folder"]')!);
    dialog = host.querySelector("dialog")!;
    await waitFor(() => dialog.open);
    dialog.close(); // Escape
    expect(host.querySelector("dialog")).toBeNull();

    const restore = intercept(() => new Response("read-only", { status: 403 }));
    try {
      click(host.querySelector('[aria-label="New folder"]')!);
      dialog = host.querySelector("dialog")!;
      await waitFor(() => dialog.open);
      type(dialog.querySelector("input")!, "nope");
      submit(dialog.querySelector("form")!);
      await waitFor(() => notice.get());
      expect(notice.get()).toBe("Couldn't create images/nope: 403 read-only");
      expect(trailOf(host.querySelector(".browser-header")!)).toBe("images"); // stayed put
    } finally {
      restore();
    }
    dispose();
  });

  test("an images folder it can't list speaks", async () => {
    const restore = intercept(() => new Response("boom", { status: 500 }));
    try {
      const { host, dispose } = render(() => <ImageBrowser />);
      await waitFor(() => notice.get());
      expect(rows(host)).toEqual([]);
      dispose();
    } finally {
      restore();
    }
  });
});

// --- The collection pane ---
//
// Its collection lives in a folder whose name starts with a dot, so the site's
// own walks — the nav, the search index, the export — never meet what these
// tests write, and the pane can be pulled about without breaking a page.

describe("CollectionPane", () => {
  // One folder per test: the pane writes as you change it, and a write still
  // in the air when a test ends must not land on the next test's file.
  let FOLDER = "";
  let made = 0;
  const fresh = () => { FOLDER = `.pane${++made}`; return FOLDER; };
  const FILE = () => `/edit/pages/${FOLDER}/collection.json`;

  // No `fields`: a picture in src, a title and a caption, the plain three.
  const seed = () => ({
    labels: { title: { Print: "A print" } },
    images: { src: `/static/images/${FOLDER}/`, suffix: "_tn" },
    groups: [
      {
        name: "paintings",
        label: "Paintings",
        items: [
          { src: "one.svg", title: "First", caption: "First caption" },
          { src: "two.svg", title: "Second", caption: "" },
        ],
        groups: [{ name: "studies", items: [{ src: "three.svg", title: "Study" }] }],
      },
      { name: "prints", items: [{ src: "four.svg", title: "Print" }] },
    ],
  });

  const write = (body: unknown) =>
    fetch(FILE(), { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) });
  const stored = async () => JSON.parse(await (await fetch(FILE())).text());

  // The pane writes as you change it, so a test waits for the file to say so.
  async function storedWhen(check: (file: any) => boolean): Promise<any> {
    const start = Date.now();
    for (;;) {
      const file = await stored();
      if (check(file)) return file;
      if (Date.now() - start > 2000) throw new Error(`the file never said so: ${JSON.stringify(file)}`);
      await settle(10);
    }
  }

  const edit = (el: Element, value: string) => {
    (el as HTMLInputElement).value = value;
    el.dispatchEvent(new Event("change"));
  };
  const values = (host: ParentNode, selector: string) =>
    [...host.querySelectorAll(selector)].map((el) => (el as HTMLInputElement).value);
  // The works as the grid draws them, by the title under each picture.
  const titles = (host: ParentNode) => [...host.querySelectorAll(".item-tile .item-title")].map((t) => t.textContent);
  const names = (host: ParentNode) => values(host, ".group-name");
  const tool = (row: Element, label: string) => row.querySelector(`[aria-label="${label}"]`)!;
  const items = (host: ParentNode) => [...host.querySelectorAll(".collection-item")];
  // A work's fields and tools are in the drawer at the left, for the one chosen.
  const panel = (host: ParentNode) => host.querySelector(".collection-chosen")!;
  const pick = (host: ParentNode, i: number) => {
    click(items(host)[i]!.querySelector(".item-tile")!);
    return panel(host);
  };

  // A drag or a drop, as the pane sees one: happy-dom has no DragEvent, and
  // the pane deliberately keeps what is being dragged in a signal rather than
  // in dataTransfer, so this is the whole of it.
  const fire = (el: Element, type: string, dataTransfer?: unknown) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { dataTransfer });
    el.dispatchEvent(event);
  };
  const choose = (input: Element, file: File) => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
  };
  const picture = (name: string) => new File(["<svg/>"], name, { type: "image/svg+xml" });

  // The pane, with the drawer at the left beside it (where a chosen work's
  // properties open), and the first work opened there as a click would.
  const mountPane = () => render(() => <div><CollectionPane /><LeftDrawer /></div>);
  const opened = async (host: ParentNode) => {
    click(host.querySelector(".item-tile")!);
    await waitFor(() => host.querySelector(".collection-chosen") !== null);
  };

  async function open() {
    fresh();
    await write(seed());
    openCollection(FOLDER);
    const { host, dispose } = mountPane();
    await waitFor(() => host.querySelectorAll(".collection-item").length === 4);
    await opened(host);
    return { host, dispose: () => { dispose(); closeCollection(); } };
  }

  test("shows the groups and works of a collection, and edits a title and a caption in place", async () => {
    const { host, dispose } = await open();
    // A group is shown by its label when it has one, and by its name when it
    // hasn't — exactly what the site shows.
    expect(names(host)).toEqual(["Paintings", "studies", "prints"]);
    expect(titles(host)).toEqual(["First", "Second", "Study", "Print"]);
    expect(host.querySelector(".pane-header .pane-name")!.textContent).toBe(`${FOLDER}/collection.json`);
    expect(items(host)[0]!.querySelector("img")!.getAttribute("src"))
      .toBe(`/static/images/${FOLDER}/one_tn.svg`);
    // The first work is chosen as the pane opens; a click opens its properties
    // in the drawer at the left (open() made it).
    expect(items(host)[0]!.querySelector(".item-tile")!.getAttribute("aria-pressed")).toBe("true");
    expect(panel(host).querySelector(".item-src")!.textContent).toBe("one.svg");
    expect(pick(host, 2).querySelector(".item-src")!.textContent).toBe("three.svg");
    expect(panel(host).getAttribute("aria-label")).toBe("The work: Study");
    pick(host, 0);

    edit(host.querySelector(`[data-field="title"]`)!, "First Light");
    const file = await storedWhen((f) => f.groups[0].items[0].title === "First Light");
    expect(file.labels).toEqual({ title: { Print: "A print" } });   // what the pane doesn't show is kept

    edit(host.querySelector(`[data-field="caption"]`)!, "Ink on paper");
    await storedWhen((f) => f.groups[0].items[0].caption === "Ink on paper");
    dispose();
  });

  test("moves a work up and down, and a group with it", async () => {
    const { host, dispose } = await open();
    click(tool(pick(host, 1), "Move up"));
    await storedWhen((f) => f.groups[0].items[0].title === "Second");
    await waitFor(() => titles(host)[0] === "Second");

    // The choice went with the work: down again, and it is where it was.
    expect(items(host)[0]!.querySelector(".item-tile")!.getAttribute("aria-pressed")).toBe("true");
    click(tool(panel(host), "Move down"));
    await storedWhen((f) => f.groups[0].items[0].title === "First");

    // The ends hold: the first can't go up and the last can't go down.
    click(tool(pick(host, 0), "Move up"));
    click(tool(pick(host, 3), "Move down"));
    await settle(60);
    expect(titles(host)).toEqual(["First", "Second", "Study", "Print"]);

    const group = host.querySelectorAll(".collection-group")[0]!;
    click(tool(group, "Move group down"));
    await storedWhen((f) => f.groups[0].name === "prints");
    await waitFor(() => names(host)[0] === "prints");
    click(host.querySelectorAll(".collection-group")[1]!.querySelector('[aria-label="Move group up"]')!);
    await storedWhen((f) => f.groups[0].name === "paintings");
    dispose();
  });

  test("moves a work by dragging it, inside its group and into another", async () => {
    const { host, dispose } = await open();
    const row = (i: number) => items(host)[i]!;

    fire(row(1), "dragstart", { setData: () => {} });
    fire(row(0), "dragover");
    fire(row(0), "drop");
    await storedWhen((f) => f.groups[0].items[0].title === "Second");

    // Into the group below: the work leaves one and joins the other.
    fire(row(0), "dragstart");
    fire(row(3), "drop");
    await storedWhen((f) => f.groups[1].items.length === 2);
    expect((await stored()).groups[0].items).toHaveLength(1);

    // A drop with nothing being dragged is not a move.
    fire(row(0), "dragend");
    fire(row(0), "drop");
    await settle(60);
    expect((await stored()).groups[1].items).toHaveLength(2);
    dispose();
  });

  test("adds, renames and removes a group, and asks before it removes one", async () => {
    const { host, dispose } = await open();
    click(button(host, "Add group")!);
    await storedWhen((f) => f.groups.length === 3);
    await waitFor(() => names(host).length === 4);
    expect(names(host)[3]).toBe("New group");

    edit(host.querySelectorAll(".group-name")[3]!, "Drawings");
    await storedWhen((f) => f.groups[2].name === "Drawings");

    // A subgroup, under the group it belongs to.
    click(tool(host.querySelectorAll(".collection-group")[3]!, "Add subgroup"));
    await storedWhen((f) => f.groups[2].groups?.length === 1);

    // Removing asks first, and says undo brings it back.
    click(tool(host.querySelectorAll(".collection-group")[3]!, "Remove group"));
    await waitFor(() => host.querySelector("dialog")?.open);
    expect(host.querySelector("dialog h3")!.textContent).toBe("Remove Drawings and its items?");
    expect(host.querySelector("dialog p")!.textContent).toContain("Undo");
    click(button(host.querySelector("dialog")!, "Cancel")!);
    expect(host.querySelector("dialog")).toBeNull();
    expect((await stored()).groups).toHaveLength(3);

    click(tool(host.querySelectorAll(".collection-group")[3]!, "Remove group"));
    await waitFor(() => host.querySelector("dialog")?.open);
    click(button(host.querySelector("dialog")!, "Remove")!);
    await storedWhen((f) => f.groups.length === 2);
    dispose();
  });

  test("removes a work, once asked", async () => {
    const { host, dispose } = await open();
    click(tool(pick(host, 3), "Remove item"));
    await waitFor(() => host.querySelector("dialog")?.open);
    expect(host.querySelector("dialog h3")!.textContent).toBe("Remove Print?");
    click(button(host.querySelector("dialog")!, "Remove")!);
    await storedWhen((f) => f.groups[1].items.length === 0);
    dispose();
  });

  test("adds a work by choosing a picture, and by dropping one", async () => {
    const { host, dispose } = await open();
    const drop = host.querySelectorAll(".item-drop")[0]!;

    // Nothing chosen is nothing done.
    choose(drop.querySelector("input")!, undefined as unknown as File);
    await settle(30);
    expect(titles(host)).toHaveLength(4);

    click(drop);  // opens the chooser; the choosing is the next line
    // And from the keyboard, as a button: Enter and Space open it, other keys don't.
    expect(drop.getAttribute("role")).toBe("button");
    expect(drop.getAttribute("tabindex")).toBe("0");
    const chooser = drop.querySelector("input")!;
    const opened = mock(() => {});
    chooser.click = opened;
    for (const key of ["Enter", " ", "a"]) drop.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    expect(opened).toHaveBeenCalledTimes(2);
    delete (chooser as { click?: unknown }).click;
    choose(drop.querySelector("input")!, picture("Fifth Work.svg"));
    await storedWhen((f) => f.groups[0].items.length === 3);
    const added = (await stored()).groups[0].items[2];
    expect(added).toEqual({ src: "Fifth Work.svg", title: "Fifth Work", caption: "" });
    await waitFor(() => titles(host).includes("Fifth Work"));
    // The picture and its thumbnail are both where the collection says.
    expect((await fetch(`/static/images/${FOLDER}/Fifth%20Work.svg`)).status).toBe(200);
    expect((await fetch(`/static/images/${FOLDER}/Fifth%20Work_tn.svg`)).status).toBe(200);

    fire(drop, "dragover");
    fire(drop, "drop", { files: [picture("Sixth.svg")] });
    await storedWhen((f) => f.groups[0].items.length === 4);
    dispose();
  });

  test("swaps a work's picture in place, under the same name, and busts the cache", async () => {
    const { host, dispose } = await open();
    // The chosen work's picture, beside the grid, is the control that replaces it.
    const thumb = panel(host).querySelector(".item-thumb")!;
    const was = items(host)[0]!.querySelector("img")!.getAttribute("src");

    click(thumb);   // the picture is the control: clicking it opens the chooser
    thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));  // not a way in
    choose(thumb.querySelector("input")!, picture("ignored.svg"));
    await waitFor(() => items(host)[0]!.querySelector("img")!.getAttribute("src") !== was);
    expect(items(host)[0]!.querySelector("img")!.getAttribute("src"))
      .toMatch(new RegExp(`^/static/images/${FOLDER}/one_tn\\.svg\\?v=`));
    // The file itself is untouched: the work keeps its address.
    expect((await stored()).groups[0].items[0].src).toBe("one.svg");

    fire(thumb, "dragover");
    fire(thumb, "drop", { files: [picture("also-ignored.svg")] });
    await settle(60);
    expect((await stored()).groups[0].items[0].src).toBe("one.svg");
    dispose();
  });

  test("an item with no picture says so rather than writing one under no name", async () => {
    await write({ images: { src: `/static/images/${fresh()}/` }, groups: [{ name: "odd", items: [{ title: "No picture" }] }] });
    openCollection(FOLDER);
    const { host, dispose } = mountPane();
    await waitFor(() => host.querySelector(".collection-item"));
    await opened(host);
    expect(host.querySelector(".item-thumb img")!.getAttribute("src")).toBe("");

    choose(host.querySelector(".item-thumb input")!, picture("nowhere.svg"));
    await waitFor(() => notice.get());
    expect(notice.get()).toBe("That item has no picture to replace — its src is empty.");
    dispose();
    closeCollection();
  });

  test("a collection whose pictures live elsewhere says so, and offers no way to add one", async () => {
    fresh();
    await write({ images: "https://pictures.example.com/", groups: [{ name: "away", items: [{ src: "a.jpg", title: "Away" }] }] });
    openCollection(FOLDER);
    const { host, dispose } = mountPane();
    await waitFor(() => host.querySelector(".pane-note"));
    expect(host.querySelector(".pane-note")!.textContent).toContain("can't write");
    expect(host.querySelector(".item-drop")).toBeNull();
    // The grid shows the thumbnail; the drawer, the picture itself.
    expect(host.querySelector(".item-tile img")!.getAttribute("src")).toBe("https://pictures.example.com/a_tn.jpg");
    await opened(host);
    expect(host.querySelector(".item-thumb img")!.getAttribute("src")).toBe("https://pictures.example.com/a.jpg");
    dispose();
    closeCollection();
  });

  test("a collection.json the pane can't read is said, not shown as an empty collection", async () => {
    fresh();
    await write("{ groups: oops");
    openCollection(FOLDER);
    const { host, dispose } = render(() => <CollectionPane />);
    await waitFor(() => notice.get().includes("can't be read"));
    expect(notice.get()).toContain(`${FOLDER}/collection.json can't be read`);
    expect(host.querySelector(".placeholder")!.textContent).toContain("edit it as a file");
    expect(host.querySelector(".collection-group")).toBeNull();
    dispose();
    closeCollection();

    // JSON, but not a collection: a list of groups where the file goes.
    await write([{ name: "loose" }]);
    openCollection(FOLDER);
    const second = render(() => <CollectionPane />);
    await waitFor(() => notice.get().includes("isn't an object"));
    second.dispose();
    closeCollection();
  });

  test("a write that fails leaves the pane unsaved and speaks; Save tries again", async () => {
    const { host, dispose } = await open();
    const save = button(host, "Save")!;
    const restore = intercept(() => new Response("read-only", { status: 403 }));
    try {
      edit(host.querySelector(`[data-field="title"]`)!, "Nope");
      await waitFor(() => notice.get());
      expect(notice.get()).toBe(`Couldn't save ${FOLDER}/collection.json: 403 read-only`);
      await waitFor(() => host.querySelector(".pane-header .dot") !== null);
    } finally {
      restore();
    }
    click(save);
    await waitFor(() => save.textContent!.includes("Saved"));
    await storedWhen((f) => f.groups[0].items[0].title === "Nope");
    dispose();
  });

  // --- the fields the file declares ---

  async function openWith(body: () => unknown, rows: number) {
    fresh();
    await write(body());
    openCollection(FOLDER);
    const { host, dispose } = mountPane();
    await waitFor(() => host.querySelectorAll(".collection-item").length === rows);
    if (rows) await opened(host);
    return { host, dispose: () => { dispose(); closeCollection(); } };
  }
  const field = (row: Element, name: string) => row.querySelector(`[data-field="${name}"]`) as HTMLInputElement;

  test("shows an input per declared field, labelled as the file labels it, and the image field is the picture", async () => {
    const { host, dispose } = await openWith(() => ({
      fields: [
        "title",
        { name: "photo", kind: "image", label: "Photo" },
        { name: "year", kind: "number", label: "Year" },
        { name: "notes", kind: "long", label: "Notes" },
      ],
      images: { src: `/static/images/${FOLDER}/` },
      groups: [{ name: "works", items: [{ photo: "one.svg", title: "One", year: 1961, index: "a", notes: "" }] }],
    }), 1);
    const row = panel(host);
    expect([...row.querySelectorAll("[data-field]")].map((el) => el.getAttribute("data-field")))
      .toEqual(["title", "year", "notes"]);
    // Each input is named by its label, a <label> for it: a bare string is a
    // text field labelled by its name, and a declared label is used as it is.
    const label = (name: string) => row.querySelector(`label[for="${field(row, name).id}"]`)!.textContent;
    expect(label("title")).toBe("title");
    expect(label("year")).toBe("Year");
    expect(label("notes")).toBe("Notes");
    expect(field(row, "notes").tagName).toBe("TEXTAREA");
    // A number field is a line of text: it may say "skip", and 1961 is shown as the site reads it.
    expect(field(row, "year").tagName).toBe("INPUT");
    expect(field(row, "year").type).toBe("text");
    expect(field(row, "year").value).toBe("1961");
    expect(items(host)[0]!.querySelector("img")!.getAttribute("src")).toBe(`/static/images/${FOLDER}/one_tn.svg`);
    expect(row.querySelector(".item-src")!.textContent).toBe("one.svg");
    expect(row.querySelector('[data-field="caption"]')).toBeNull();

    edit(field(row, "year"), "skip");
    const file = await storedWhen((f) => f.groups[0].items[0].year === "skip");
    expect(file.groups[0].items[0].index).toBe("a");   // undeclared, unshown, kept

    // A new picture goes in the image field, and the item says every field.
    choose(host.querySelector(".item-drop input")!, picture("Two Birds.svg"));
    const added = (await storedWhen((f) => f.groups[0].items.length === 2)).groups[0].items[1];
    expect(added).toEqual({ photo: "Two Birds.svg", title: "Two Birds", year: "", notes: "" });

    // And a picture is replaced under the name the image field gives it.
    await waitFor(() => items(host).length === 2);
    choose(pick(host, 0).querySelector(".item-thumb input")!, picture("ignored.svg"));
    await waitFor(() => items(host)[0]!.querySelector("img")!.getAttribute("src")!.includes("?v="));
    expect((await stored()).groups[0].items[0].photo).toBe("one.svg");
    dispose();
  });

  test("a collection with no picture field is words only, and adds an item as a row of empty fields", async () => {
    const { host, dispose } = await openWith(() => ({
      fields: ["title", { name: "year", kind: "number" }],
      groups: [{ name: "events", items: [{ title: "Opening", year: "2024" }] }],
    }), 1);
    expect(host.querySelector(".item-thumb")).toBeNull();
    expect(host.querySelector(".item-src")).toBeNull();
    expect(host.querySelector("div.item-drop")).toBeNull();

    click(button(host, "Add item")!);
    const file = await storedWhen((f) => f.groups[0].items.length === 2);
    expect(file.groups[0].items[1]).toEqual({ title: "", year: "" });
    await waitFor(() => items(host).length === 2);
    dispose();
  });

  // --- n99: a renamed work keeps its old address ---

  test("renaming a work keeps the address it was published at, says so once, and renaming back takes it off", async () => {
    const { host, dispose } = await open();
    const title = (i: number) => field(pick(host, i), "title");

    edit(title(0), "First Light");
    let file = await storedWhen((f) => f.groups[0].items[0].aliases);
    expect(file.groups[0].items[0].aliases).toEqual([`/${FOLDER}/first/`]);
    expect(notice.get()).toBe(`First Light is now /${FOLDER}/first-light/; the old address still leads there.`);
    expect(news.get()).toBe(true);
    hush();

    // Renamed again in the same sitting: /first-light/ was never an address
    // anyone linked to, so /first/ is still the only one kept, and nothing is said.
    edit(title(0), "Dawn");
    file = await storedWhen((f) => f.groups[0].items[0].title === "Dawn");
    expect(file.groups[0].items[0].aliases).toEqual([`/${FOLDER}/first/`]);
    await settle(30);
    expect(notice.get()).toBe("");

    // Back to its old name: the alias would be its own address, so it goes.
    edit(title(0), "First");
    file = await storedWhen((f) => f.groups[0].items[0].title === "First");
    expect("aliases" in file.groups[0].items[0]).toBe(false);

    // A caption is not an address.
    edit(field(panel(host), "caption"), "Ink");
    file = await storedWhen((f) => f.groups[0].items[0].caption === "Ink");
    expect("aliases" in file.groups[0].items[0]).toBe(false);
    dispose();
  });

  test("an alias the file already has is kept beside the new one, and a work taking another's address is not given it", async () => {
    fresh();
    const body = seed();
    (body.groups[0]!.items[1] as Record<string, unknown>).aliases = ["/second-1962", 7];
    await write(body);
    openCollection(FOLDER);
    const { host, dispose } = mountPane();
    await waitFor(() => items(host).length === 4);
    await opened(host);

    // "Second" becomes "Study": it comes first in the file, so it takes
    // /study/, and the study moves to /study-1/. The study's old address now
    // answers with the other work — an item wins over an alias — so that is
    // not kept; the second work's old one is, beside what it had.
    edit(field(pick(host, 1), "title"), "Study");
    const file = await storedWhen((f) => f.groups[0].items[1].aliases?.length === 3);
    expect(file.groups[0].items[1].aliases).toEqual(["/second-1962", 7, `/${FOLDER}/second/`]);
    expect(file.groups[0].groups[0].items[0].aliases).toBeUndefined();
    dispose();
    closeCollection();
  });

  test("a work added in this sitting was never published, so renaming it keeps nothing", async () => {
    const { host, dispose } = await open();
    choose(host.querySelector(".item-drop input")!, picture("Fifth.svg"));
    await waitFor(() => items(host).length === 5);
    // A new work is chosen as it is added: it is the one you are about to name.
    await waitFor(() => panel(host).getAttribute("aria-label") === "The work: Fifth");
    edit(field(panel(host), "title"), "Fifth Work");
    const file = await storedWhen((f) => f.groups[0].items[2]?.title === "Fifth Work");
    expect(file.groups[0].items[2].aliases).toBeUndefined();
    dispose();
  });

  test("a rename whose write fails keeps nothing until Save writes it, and says so then", async () => {
    const { host, dispose } = await open();
    const restore = intercept(() => new Response("read-only", { status: 403 }));
    try {
      edit(field(panel(host), "title"), "Moved");
      await waitFor(() => notice.get());
      expect(notice.get()).toBe(`Couldn't save ${FOLDER}/collection.json: 403 read-only`);
    } finally {
      restore();
    }
    click(button(host, "Save")!);
    await waitFor(() => news.get());
    expect(notice.get()).toBe(`Moved is now /${FOLDER}/moved/; the old address still leads there.`);
    expect((await stored()).groups[0].items[0].aliases).toEqual([`/${FOLDER}/first/`]);
    dispose();
  });

  test("the first work is the one the site shows first, through empty groups to a subgroup's", () => {
    expect(firstWork({ groups: [{ name: "empty" }, { name: "outer", groups: [{ name: "inner", items: [{ title: "Deep" }] }] }] }))
      .toEqual({ path: [1, 0], i: 0 });
    expect(firstWork({ groups: [{ name: "none", items: [] }] })).toBeNull();
    expect(firstWork({})).toBeNull();
    expect(same(null, { path: [0], i: 0 })).toBe(false);
    expect(same({ path: [0, 1], i: 0 }, { path: [0], i: 0 })).toBe(false);
  });

  test("works out every address exactly as the site does", () => {
    const raw = {
      groups: [
        {
          name: "a",
          items: [
            { title: "Café Ölé" },
            { title: "Cafe Ole" },               // the same slug: -1
            { title: "…" },                      // nothing usable: by position
            { title: "x", slug: "Not A Slug" },  // stated, cleaned
            { title: "y", slug: "own-slug" },
            { title: 1961 },                     // a number is read as text
            null,                                // not an item at all
            { slug: 7 },
          ],
          groups: [{ name: "b", items: [{ title: "Cafe Ole" }, {}] }],
        },
        "not a group",
        { name: "c", items: [{ title: "Own Slug" }] },
      ],
    };
    const site = parseCollection("works", JSON.stringify(raw)).items.map((item) => item.href);
    expect(itemAddresses(raw as never, "works").map((a) => a.href)).toEqual(site);
    expect(site).toContain("/works/cafe-ole-1/");
    expect(site).toContain("/works/item-3/");
    expect(itemAddresses({}, "").length).toBe(0);
  });

  test("the pane follows the folder, and deletes the file it has open", async () => {
    const { host, dispose } = await open();
    // Another collection, opened while this one is up: when() doesn't rebuild
    // a pane that is already showing, so the pane itself has to follow.
    openCollection("gallery");
    await waitFor(() => titles(host).includes("First Light"));
    expect(host.querySelector(".pane-header .pane-name")!.textContent).toBe("gallery/collection.json");
    openCollection(FOLDER);
    await waitFor(() => host.querySelector(".pane-header .pane-name")!.textContent === `${FOLDER}/collection.json`);

    click(host.querySelector(`[aria-label="Delete ${FOLDER}/collection.json"]`)!);
    await waitFor(() => host.querySelector("dialog")?.open);
    click(button(host.querySelector("dialog")!, "Delete")!);
    await waitFor(() => collection.get() === null);
    expect((await fetch(FILE())).status).toBe(404);
    dispose();
  });

  test("a collection is offered when its folder's page is opened, and the tree opens one directly", async () => {
    fresh();
    await write(seed());
    await fetch(`/edit/pages/${FOLDER}/index.md`, { method: "PUT", body: "title: Pane\n\n{{items}}" });

    await loadFile(`${FOLDER}/index.md`);
    expect(collection.get()).toEqual({ folder: FOLDER });

    // A page in another folder takes it away: the pane belongs to the folder.
    await loadFile("index.md");
    expect(collection.get()).toBeNull();

    // With something else already in that slot, the offer stands down.
    await openResource({ section: "static", path: "poster.css" });
    await loadFile(`${FOLDER}/index.md`);
    expect(collection.get()).toBeNull();
    closeResource();

    // Opening a resource closes the collection: one thing below the page.
    openCollection(FOLDER);
    await openResource({ section: "static", path: "poster.css" });
    expect(collection.get()).toBeNull();
    closeResource();

    // And the file itself is in the tree, opening as a pane rather than as JSON.
    // (The tree went to the page's folder with it: back to the top first.)
    expect(folder.get()).toBe(FOLDER);
    openFolder("");
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rows(host).includes("gallery"));
    click(rowControl(host, "gallery"));
    await waitFor(() => rows(host).includes("collection.json"));
    click(rowControl(host, "collection.json"));
    expect(collection.get()).toEqual({ folder: "gallery" });
    expect(filePath.get()).toBe(`${FOLDER}/index.md`);   // the page in the middle stayed put
    closeCollection();
    dispose();
  });

  test("a chosen work opens in the drawer at the left: on a click, never by itself; Escape puts it away", async () => {
    fresh();
    await write(seed());
    openCollection(FOLDER);
    const { host, dispose } = mountPane();
    await waitFor(() => items(host).length === 4);
    // The first work is chosen as the pane opens, but nothing covers the tree
    // until a work is clicked.
    expect(items(host)[0]!.querySelector(".item-tile")!.getAttribute("aria-pressed")).toBe("true");
    await settle(20);
    expect(host.querySelector(".sidebar-left")).toBeNull();
    expect(leftDrawer.get()).toBeNull();

    // A click opens it, over the tree: the work's picture — the picture
    // itself, not its thumbnail — its fields, and its name at the top.
    const second = items(host)[1]!.querySelector(".item-tile")! as HTMLElement;
    click(second);
    await waitFor(() => host.querySelector(".sidebar-left .collection-chosen") !== null);
    const drawerEl = host.querySelector(".sidebar-left")!;
    expect(drawerEl.querySelector("h3")!.textContent).toBe("Second");
    expect(drawerEl.querySelector(".item-thumb img")!.getAttribute("src")).toBe(`/static/images/${FOLDER}/two.svg`);
    // Another work, with it open, is the drawer showing that one instead.
    click(items(host)[2]!.querySelector(".item-tile")!);
    expect(drawerEl.querySelector("h3")!.textContent).toBe("Study");

    // Undo and redo answer from inside it, as they do in the pane.
    edit(host.querySelector(`[data-field="caption"]`)!, "Crayon");
    await storedWhen((f) => f.groups[0].groups[0].items[0].caption === "Crayon");
    drawerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }));
    await storedWhen((f) => f.groups[0].groups[0].items[0].caption === undefined);

    // Escape puts it away; the choice stays marked in the grid.
    drawerEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await waitFor(() => host.querySelector(".sidebar-left") === null);
    expect(items(host)[2]!.querySelector(".item-tile")!.getAttribute("aria-pressed")).toBe("true");

    // Open again, then the pane goes: the drawer goes with it.
    click(items(host)[0]!.querySelector(".item-tile")!);
    await waitFor(() => leftDrawer.get() !== null);
    dispose();
    closeCollection();
    expect(leftDrawer.get()).toBeNull();
  });

  test("undoes and redoes, from the header or the keyboard, and each step is written", async () => {
    const { host, dispose } = await open();
    const pane = host.querySelector(".panel-collection")!;
    const undo = tool(host, "Undo") as HTMLButtonElement;
    const redo = tool(host, "Redo") as HTMLButtonElement;
    const key = (target: Element, init: KeyboardEventInit) =>
      target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    edit(host.querySelector(`[data-field="title"]`)!, "Renamed");
    await storedWhen((f) => f.groups[0].items[0].title === "Renamed");
    expect(undo.disabled).toBe(false);
    await waitFor(() => notice.get().includes("the old address still leads there"));
    click(tool(pick(host, 1), "Move up"));
    await storedWhen((f) => f.groups[0].items[0].title === "Second");

    click(undo);                                                             // the move
    await storedWhen((f) => f.groups[0].items[0].title === "Renamed");
    expect(redo.disabled).toBe(false);
    key(pane, { key: "z", metaKey: true });                                  // ⌘Z: the rename too
    await storedWhen((f) => f.groups[0].items[0].title === "First");
    expect(titles(host)[0]).toBe("First");
    expect(undo.disabled).toBe(true);
    expect(notice.get()).toBe("");               // the rename's news went with it
    // A field being typed in keeps its own undo; a plain Z is a letter.
    key(host.querySelector(`[data-field="title"]`)!, { key: "z", ctrlKey: true, shiftKey: true });
    key(pane, { key: "z" });
    expect(titles(host)[0]).toBe("First");

    key(pane, { key: "Z", ctrlKey: true, shiftKey: true });                 // ⇧⌘Z
    await storedWhen((f) => f.groups[0].items[0].title === "Renamed");
    key(pane, { key: "y", ctrlKey: true });                                  // and Ctrl+Y
    await waitFor(() => redo.disabled);
    key(pane, { key: "y", ctrlKey: true });                                  // nothing left to redo
    click(redo);
    expect(redo.disabled).toBe(true);

    // A new change after an undo: there is nothing to redo any more.
    click(undo);
    await waitFor(() => !redo.disabled);
    edit(host.querySelector(`[data-field="caption"]`)!, "New caption");
    await waitFor(() => redo.disabled);
    await storedWhen((f) => f.groups[0].items[0].caption === "New caption");
    dispose();
  });

  test("puts back an earlier version of the file, and starts its undo afresh", async () => {
    const { host, dispose } = await open();
    edit(host.querySelector(`[data-field="title"]`)!, "Changed");
    await storedWhen((f) => f.groups[0].items[0].title === "Changed");

    // Earlier versions is a place of its own; the version shows where the pane was.
    const then = render(() => when(seen, () => <PastPane />));
    click(tool(host, `Earlier versions of ${FOLDER}/collection.json`));
    await waitFor(() => button(then.host, "Restore"));
    click(button(then.host, "Restore")!);
    await storedWhen((f) => f.groups[0].items[0].title === "First");
    await waitFor(() => titles(host)[0] === "First");
    expect(news.get()).toBe(true);
    expect(notice.get()).toContain(`${FOLDER}/collection.json is back as it was on`);
    expect((tool(host, "Undo") as HTMLButtonElement).disabled).toBe(true);
    then.dispose();
    dispose();
  });
});

// --- History.tsx: earlier versions, and what was deleted ---

describe("earlier versions", () => {
  afterEach(closeResource);

  // The past's three compartments beside whatever a test puts in the present.
  const THEN = () => <div>
    {when(past, () => <PastList />)}
    {when(seen, () => <PastPane />)}
    {when(seen, () => <PastPreview />)}
  </div>;
  const pastRows = (host: ParentNode) =>
    [...host.querySelectorAll(".panel-past .file-list li")].map((li) => li.querySelector(".row-label")!.textContent);
  const pastRow = (host: ParentNode, label: string) =>
    [...host.querySelectorAll(".panel-past .file-list button.row")].find((b) => b.querySelector(".row-label")!.textContent === label) as HTMLElement;

  test("a page's versions are a place: where the tree was, shown before they are brought back", async () => {
    await createFile("/versions-test.md", "versions-test.md");
    const { host, dispose } = render(() => <div><Editor />{THEN()}</div>);
    const history = host.querySelector('[aria-label="Earlier versions of versions-test.md"]')!;

    click(history);
    expect(entries.get()).toBeNull();                       // being asked for
    await waitFor(() => host.querySelector(".panel-past .past-hint:not(.past-foot)")?.textContent?.startsWith("None yet"));
    expect(host.querySelector(".panel-past .pane-title")!.textContent).toBe("Earlier versions");
    click(host.querySelector('[aria-label="Back to the files"]')!);
    expect(past.get()).toBeNull();

    type(host.querySelector(".editor-area textarea")!, "title: versions-test\n\n# Second");
    expect(await saveFile()).toBe(true);
    click(history);
    // The newest is shown at once, read only, what differs from now marked,
    // and rendered where the preview was.
    await waitFor(() => host.querySelector(".past-pane"));
    expect(pastRows(host)).toEqual(["Now", seen.get()!.entry.label]);
    expect(host.querySelector(".panel-past .row-detail:not(:first-child)")).not.toBeNull();
    expect([...host.querySelectorAll(".panel-past .row-detail")].map((d) => d.textContent)).toEqual(["as it is", "22 bytes"]);
    expect(host.querySelector(".past-pane .pane-name")!.textContent).toBe("versions-test.md");
    expect(host.querySelector(".past-pane .pane-when")!.textContent).toStartWith("as it was, ");
    expect(host.querySelector(".past-text")!.textContent).toBe("title: versions-test");
    expect(host.querySelectorAll(".past-text mark")).toHaveLength(1);   // the blank line "# Second" replaced
    await waitFor(() => (host.querySelector(".past-preview iframe") as HTMLIFrameElement | null)?.srcdoc.includes("versions-test"));

    // Now is a row of its own: the file as it is, the past still open.
    click(pastRow(host, "Now"));
    expect(host.querySelector(".past-pane")).toBeNull();
    expect(pastRow(host, "Now").getAttribute("aria-current")).toBe("true");
    click(pastRow(host, seen.peek()?.entry.label ?? pastRows(host)[1]!));
    await waitFor(() => host.querySelector(".past-pane"));
    click(host.querySelector('[aria-label="Back to now"]')!);
    expect(seen.get()).toBeNull();
    click(pastRow(host, pastRows(host)[1]!));
    await waitFor(() => host.querySelector(".past-pane"));

    // A restore that fails says so and leaves you where you were.
    const restore = intercept(() => new Response("nope", { status: 500 }));
    try {
      click(button(host.querySelector(".past-pane")!, "Restore")!);
      await waitFor(() => notice.get().startsWith("Couldn't restore versions-test.md"));
      expect(host.querySelector(".past-pane")).not.toBeNull();
    } finally {
      restore();
    }
    await waitFor(() => !button(host.querySelector(".past-pane")!, "Restore")!.disabled);
    click(button(host.querySelector(".past-pane")!, "Restore")!);
    await waitFor(() => editorContent.get() === "title: versions-test\n\n");
    expect(past.get()).toBeNull();
    expect(news.get()).toBe(true);
    await deleteFile();
    dispose();
  });

  test("a stylesheet's versions, from the resource pane: its words, and no page to render", async () => {
    await createResource("static", "versions.css");
    const { host, dispose } = render(() => <div><ResourcePane />{THEN()}</div>);
    resourceDraft.set("/* changed */\n");
    expect(await saveResource()).toBe(true);
    click(host.querySelector('[aria-label="Earlier versions of versions.css"]')!);
    await waitFor(() => host.querySelector(".past-pane"));
    expect(host.querySelector(".past-preview .placeholder")!.textContent).toBe("no preview for this kind of file");
    click(button(host.querySelector(".past-pane")!, "Restore")!);
    await waitFor(() => resourceSaved.get().startsWith("/* Name this"));
    await deleteResource();
    dispose();
  });

  test("what was deleted is a place too: a page and a collection come back from it, and open", async () => {
    await createFile("/deleted-test.md", "deleted-test.md");
    await deleteFile();
    await fetch("/edit/pages/deleted-coll/collection.json", { method: "PUT", body: '{ "groups": [] }' });
    await fetch("/edit/pages/deleted-coll/collection.json", { method: "DELETE" });
    const { host, dispose } = render(() => <div><Browser />{THEN()}</div>);
    const restoreRow = async (key: string) => {
      click(host.querySelector('[aria-label="Deleted pages"]')!);
      await waitFor(() => pastRows(host).includes(key));
      expect(host.querySelector(".panel-past .pane-title")!.textContent).toBe("Deleted from pages");
      click(pastRow(host, key));
      await waitFor(() => host.querySelector(".past-pane .pane-name")?.textContent === key);
      expect(host.querySelector(".past-pane .pane-when")!.textContent).toStartWith("deleted ");
      expect(host.querySelectorAll(".past-text mark")).toHaveLength(0);   // no now to differ from
      click(button(host.querySelector(".past-pane")!, "Restore")!);
      await waitFor(() => past.get() === null);
    };

    await restoreRow("deleted-test.md");
    await waitFor(() => filePath.get() === "deleted-test.md");
    await restoreRow("deleted-coll/collection.json");
    expect(collection.get()).toEqual({ folder: "deleted-coll" });
    closeCollection();
    await deleteFile();

    // Nothing deleted is said, rather than shown as an empty box.
    const restore = intercept(() => Response.json([]));
    try {
      click(host.querySelector('[aria-label="Deleted pages"]')!);
      await waitFor(() => host.querySelector(".panel-past .past-hint:not(.past-foot)")?.textContent === "Nothing has been deleted here.");
      expect(pastRows(host)).toEqual([]);   // and no "Now": a deleted file has none
    } finally {
      restore();
    }
    dispose();
  });

  test("a template deleted comes back from its own list, which steps aside for it, and opens", async () => {
    await createResource("templates", "deleted-test");
    await deleteResource();
    drawer.set("resources");
    const { host, dispose } = render(() => <div><ResourceList section="templates" />{THEN()}</div>);
    click(host.querySelector('[aria-label="Deleted templates"]')!);
    expect(drawer.get()).toBeNull();
    await waitFor(() => pastRows(host).includes("deleted-test.html"));
    click(pastRow(host, "deleted-test.html"));
    await waitFor(() => host.querySelector(".past-pane .pane-name")?.textContent === "deleted-test.html");
    click(button(host.querySelector(".past-pane")!, "Restore")!);
    await waitFor(() => resource.get()?.path === "deleted-test.html");
    await deleteResource();
    dispose();
  });

  test("the trail goes one further in the past, and every crumb before leaves it", async () => {
    const { host, dispose } = render(() => <Trail />);
    const says = (...want: string[]) =>
      waitFor(() => [...host.querySelectorAll(".crumb")].map((c) => c.textContent!.trim()).join(" › ") === want.join(" › "));

    const kept = { id: "2026-09-23T10-15-30-123Z", key: "gallery/index.md", label: "then", detail: "" };
    past.set({ kind: "versions", url: "/edit/pages/gallery/index.md", name: "gallery/index.md", onrestored: () => {} });
    await says("duckie", "gallery", "index.md", "Earlier versions");
    seen.set({ entry: kept, text: "", changed: [] });
    await says("duckie", "gallery", "index.md", "then");
    click(button(host, "index.md")!);                       // the file: back to it, as it is
    expect(past.get()).toBeNull();

    past.set({ kind: "versions", url: "/edit/pages/gallery/index.md", name: "gallery/index.md", onrestored: () => {} });
    await says("duckie", "gallery", "index.md", "Earlier versions");
    click(button(host, "gallery")!);                        // a folder: leave, and go there
    expect(past.get()).toBeNull();
    expect(folder.get()).toBe("gallery");

    past.set({ kind: "versions", url: "/edit/static/theme.css", name: "theme.css", onrestored: () => {} });
    await says("duckie", "theme.css", "Earlier versions"); // a stylesheet is in no folder of pages
    click(button(host, "duckie")!);
    expect(past.get()).toBeNull();
    expect(folder.get()).toBe("");

    past.set({ kind: "deleted", section: "pages", onrestored: () => {} });
    await says("duckie", "Deleted");
    seen.set({ entry: { ...kept, key: "blog/gone.md" }, text: "", changed: [] });
    await says("duckie", "Deleted", "blog/gone.md");
    click(button(host, "Deleted")!);                        // back to the list
    expect(seen.get()).toBeNull();
    expect(past.get()?.kind).toBe("deleted");
    dispose();
  });

  test("a version that can't be read speaks, and leaving while it is asked for draws nothing", async () => {
    await createFile("/versions-gone.md", "versions-gone.md");
    await fetch("/edit/pages/versions-gone.md", { method: "PUT", body: "changed" });
    const url = "/edit/pages/versions-gone.md";
    const asked = openVersions(url, "versions-gone.md", () => {});
    leavePast();                                            // gone before the list came back
    await asked;
    expect(entries.get()).toBeNull();

    const listed = openDeleted("pages", () => {});
    leavePast();
    await listed;
    expect(entries.get()).toBeNull();

    await openVersions(url, "versions-gone.md", () => {});
    const entry = entries.get()![0]!;
    expect(await look({ ...entry, id: "2000-01-01T00-00-00-000Z" })).toBe(false);
    expect(notice.get()).toStartWith("Couldn't read versions-gone.md as it was on");
    const looking = look(entry);
    leavePast();
    expect(await looking).toBe(false);
    expect(await look(entry)).toBe(false);                  // nowhere to look from
    expect(await restoreSeen()).toBe(false);
    await fetch(url, { method: "DELETE" });
  });

  test("marks the lines of then that aren't in now, and gives up on a pair too big to compare", () => {
    expect(changedLines("a\nb\nc", "a\nb\nc")).toEqual([]);
    expect(changedLines("a\nold\nc", "a\nnew\nc")).toEqual([1]);
    expect(changedLines("a\nb\nc", "b")).toEqual([0, 2]);
    expect(changedLines("x\ny", "a\nx\nb\ny\nc")).toEqual([]);  // only added since: nothing of then is gone
    const many = Array.from({ length: Math.ceil(Math.sqrt(COMPARE_LIMIT)) + 1 }, (_, i) => `line ${i}`).join("\n");
    expect(changedLines(many, `${many}\nmore`)).toEqual([]);
    expect(whenKept("2026-09-23T10-15-30-123Z")).toContain("2026");
  });
});

// --- app.tsx (last: it mounts for good) ---

describe("the app", () => {
  test("mounts, opens ?path=, swaps editor and previews, and gives uncaught failures a voice", async () => {
    history.replaceState(null, "", "/edit?path=index.md");
    document.body.innerHTML = '<div id="app"></div>';
    await import("../server/edit/app");
    const app = document.getElementById("app")!;
    const previewFrame = () => app.querySelector(".panel-preview iframe") as HTMLIFrameElement | null;

    await waitFor(() => filePath.get() === "index.md");
    expect(app.querySelector(".header")).not.toBeNull();
    expect(app.querySelector(".editor-area textarea")).not.toBeNull();
    await waitFor(() => previewFrame()?.srcdoc.includes("Welcome to duckdown"));

    filePath.set("theme.css"); // a .css opened as the page (reachable by ?path=)
    await waitFor(() => app.querySelector(".panel-preview iframe") !== null);

    // Neither markdown nor CSS: say so rather than render it as prose.
    filePath.set("odd.txt");
    await waitFor(() => app.querySelector(".panel-preview .placeholder") !== null);
    expect(app.querySelector(".panel-preview .placeholder")!.textContent).toBe("no preview for this kind of file");

    filePath.set(null);
    expect(app.querySelector(".panel-editor .placeholder")!.textContent).toBe("select a page or a resource");
    expect(app.querySelector(".panel-preview .placeholder")!.textContent).toBe("preview");

    drawer.set("resources");
    expect(app.querySelector(".sidebar")).not.toBeNull();

    // A resource opens below the page, in the same column, and closing the
    // pane takes it away again.
    await openResource({ section: "templates", path: "site.html" });
    expect(app.querySelector(".sidebar")).toBeNull(); // the chooser stepped aside
    expect(app.querySelector(".column-middle .panel-resource .pane-name")!.textContent).toBe("site.html");
    closeResource();
    expect(app.querySelector(".panel-resource")).toBeNull();

    // With no page open, what you are composing with gets the column and a
    // preview of its own: sample content styled by a stylesheet as you type it,
    expect(app.querySelector(".editor-area")).toBeNull(); // the page closed earlier
    await openResource({ section: "static", path: "poster.css" });
    resourceDraft.set("body { color: fuchsia }");
    await waitFor(() => previewFrame()?.srcdoc.includes("fuchsia"));
    expect(previewFrame()!.srcdoc).toContain("callout tip"); // the sample, not a page

    // and for a template, a sample page put through it.
    await openResource({ section: "templates", path: "post.html" });
    await waitFor(() => previewFrame()?.srcdoc.includes("A sample page"));
    expect(previewFrame()!.srcdoc).toContain("all posts");     // post.html's own chrome
    expect(previewFrame()!.srcdoc).toContain("21 September 2026"); // and its {{date}}, from the sample
    closeResource();

    // A collection takes the same slot as a resource — one thing below the
    // page — and with no page open there is nothing to render it against.
    openCollection("gallery");
    await waitFor(() => app.querySelector(".column-middle .panel-collection") !== null);
    expect(app.querySelector(".panel-collection .pane-name")!.textContent).toBe("gallery/collection.json");
    await waitFor(() => app.querySelector(".panel-preview .placeholder") !== null);
    expect(app.querySelector(".panel-preview .placeholder")!.textContent)
      .toBe("open the folder's page to see the collection");
    await openResource({ section: "templates", path: "post.html" });
    expect(app.querySelector(".panel-collection")).toBeNull();
    closeResource();

    // The past takes the tree's place, and its version stands in front of
    // the panes and the preview, which wait behind it rather than go.
    await loadFile("index.md");
    past.set({ kind: "versions", url: "/edit/pages/index.md", name: "index.md", onrestored: () => {} });
    seen.set({ entry: { id: "x", key: "index.md", label: "then", detail: "" }, text: "# Then", changed: [0] });
    await waitFor(() => app.querySelector(".tray > .panel-past") !== null);
    expect(app.querySelector(".tray > .panel-browser:not(.panel-past)")).toBeNull();
    expect(app.querySelector(".column-middle > .past-pane")).not.toBeNull();
    expect(app.querySelector(".column-middle .editor-area")).not.toBeNull();   // still there, behind
    await waitFor(() => (app.querySelector(".past-preview iframe") as HTMLIFrameElement | null)?.srcdoc.includes("Then"));
    leavePast();
    await waitFor(() => app.querySelector(".tray > .panel-past") === null);
    expect(app.querySelector(".past-pane")).toBeNull();
    closeFile();

    window.dispatchEvent(new ErrorEvent("error", { message: "kaboom" }));
    expect(notice.get()).toBe("Something broke: kaboom");
    expect(app.querySelector(".notice")!.textContent).toContain("kaboom");
    const rejected = (reason: unknown) => Object.assign(new Event("unhandledrejection"), { reason });
    window.dispatchEvent(rejected(new Error("nope")));
    expect(notice.get()).toBe("Something broke: nope");
    window.dispatchEvent(rejected("plain"));
    expect(notice.get()).toBe("Something broke: plain");
    history.replaceState(null, "", "/edit");
  });
});

describe("Preview, on a folder with a collection", () => {
  const frame = (host: HTMLElement) => host.querySelector("iframe") as HTMLIFrameElement;

  test("the overview renders, and a collection that can't have its addresses speaks", async () => {
    batch(() => {
      filePath.set("gallery/index.md");
      editorContent.set("title: Gallery\n\n# Gallery\n\n{{items}}");
    });
    const { host, dispose } = render(() => <Preview />);
    await waitFor(() => frame(host).srcdoc.includes("First Light"));
    expect(frame(host).srcdoc).toContain('<a class="item" href="/gallery/first-light/">');
    expect(notice.get()).toBe("");

    // Failures speak: a problem with collection.json is nothing the page's
    // own text can cause, so the preview carries it and the Notice shows it.
    const restore = intercept(() => Response.json({
      html: "<p>still here</p>", layout: "site.html", includes: [],
      problems: ['gallery/collection.json: "Notes" wants /gallery/notes/, which is already a page'],
    }));
    try {
      editorContent.set("title: Gallery\n\n# Gallery again\n\n{{items}}");
      await waitFor(() => notice.get());
      expect(notice.get()).toContain("wants /gallery/notes/");
      expect(frame(host).srcdoc).toContain("still here");   // the preview still shows
    } finally {
      restore();
    }
    dispose();
  });
});
