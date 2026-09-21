// The editor's own code, in happy-dom, talking to the real server in this
// process (signed in). Failures are staged with intercept().
import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn, mock } from "bun:test";
import { createElement, mount, batch } from "@blueshed/railroad";
import { BASE, signIn, waitFor } from "./helpers";
import { api, apiJson, urlPath } from "../server/edit/api";
import { notice, speak, hush } from "../server/edit/notice";
import {
  filePath, fileContent, editorContent, showImages, browserRevision,
  loadFile, createFile, saveFile, deleteFile, closeFile, reloadBrowser, toggleImages, closeImages,
  resource, resourceDraft, resourceSaved, resourceDirty, pageLayout, openResource, closeResource,
  saveResource, deleteResource, createResource, createTheme,
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
import { ImageBrowser } from "../server/edit/components/ImageBrowser";
import { ResourceList } from "../server/edit/components/ResourceList";
import { ResourcePane } from "../server/edit/components/ResourcePane";

// --- Harness ---

const nativeFetch = globalThis.fetch;
let signedIn: typeof fetch;

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

afterEach(() => {
  batch(() => {
    filePath.set(null);
    fileContent.set("");
    editorContent.set("");
    showImages.set(false);
  });
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
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent!.trim().startsWith(text)) as HTMLButtonElement | undefined;
const click = (el: Element) => (el as HTMLElement).click();
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
    speak("Couldn't save a.md: 500 boom");
    const alert = host.querySelector('.notice[role="alert"]')!;
    expect(alert.textContent).toContain("Couldn't save a.md: 500 boom");
    click(host.querySelector('[aria-label="Dismiss"]')!);
    expect(host.querySelector(".notice")).toBeNull();
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
    expect(input.placeholder).toBe("my-page.md");

    submit(dialog.querySelector("form")!); // no name yet: nothing to create
    expect(oncreate).not.toHaveBeenCalled();
    type(input, "taken");
    submit(dialog.querySelector("form")!);
    await waitFor(() => dialog.querySelector(".dialog-error"));
    expect(dialog.querySelector(".dialog-error")!.textContent).toBe("taken.md already exists");
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
    expect(await openResource({ section: "static", path: "site.css" })).toBe(true);

    expect(resource.peek()?.path).toBe("site.css");
    expect(resourceDraft.peek()).toContain("--accent");
    expect(filePath.peek()).toBe("index.md");   // the content is untouched
    expect(showImages.peek()).toBe(false);      // the chooser got out of the way
    expect(resourceDirty.peek()).toBe(false);
  });

  test("editing marks it unsaved; saving writes it and clears that", async () => {
    await openResource({ section: "static", path: "site.css" });
    resourceDraft.set(resourceDraft.peek() + "\n/* from the pane */\n");
    expect(resourceDirty.peek()).toBe(true);

    expect(await saveResource()).toBe(true);
    expect(resourceDirty.peek()).toBe(false);
    const onDisk = await (await fetch(`${BASE}/edit/static/site.css`, { headers: { Accept: "text/plain" } })).text();
    expect(onDisk).toContain("from the pane");
  });

  test("templates open the same way", async () => {
    expect(await openResource({ section: "templates", path: "site.html" })).toBe(true);
    expect(resourceDraft.peek()).toContain("{{content}}");
  });

  test("closing leaves nothing behind, and a missing one opens nothing", async () => {
    await openResource({ section: "static", path: "site.css" });
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

  test("a theme is made beside the page it themes, and a write that fails says so", async () => {
    expect(await createTheme("guide")).toBeUndefined();
    expect(resource.peek()).toEqual({ section: "pages", path: "guide/-theme.css" });
    expect(resourceDraft.peek()).toContain("body.mytheme");
    expect(await deleteResource()).toBe(true); // put it back as it was
    expect(await createTheme("")).toBe("-theme.css already exists"); // the root has one

    const restore = intercept(() => new Response("read-only", { status: 403 }));
    try {
      expect(await createTheme("blog")).toBe("Couldn't create blog/-theme.css");
    } finally {
      restore();
    }
    hush();
  });
});

describe("ResourceList", () => {
  afterEach(closeResource);

  test("lists templates, and picking one opens it below the page", async () => {
    const { host, dispose } = render(() => <ResourceList section="templates" />);
    await waitFor(() => rows(host).includes("site.html"));
    expect(host.querySelector(".pane-path")!.textContent).toBe("/templates");
    expect(rows(host)).not.toContain("favicon.ico");

    click(row(host, "site.html"));
    await waitFor(() => resource.peek()?.path === "site.html");
    expect(resource.peek()?.section).toBe("templates");
    dispose();
  });

  test("the css tab is static/ only: a theme is not one of these", async () => {
    await loadFile("guide/index.md");
    const { host, dispose } = render(() => <ResourceList section="static" />);
    await waitFor(() => rows(host).includes("site.css"));
    expect(host.querySelector(".pane-path")!.textContent).toBe("/static");
    // A theme lives in pages/, in the folder it themes; listing it beside
    // these would say it is the same kind of thing, and it isn't.
    expect(rows(host).some((r) => r.includes("-theme.css"))).toBe(false);
    expect(rows(host)).not.toContain("favicon.ico");
    dispose();
  });

  test("makes one from its header, and keeps the dialog open to say the name is taken", async () => {
    const { host, dispose } = render(() => <ResourceList section="static" />);
    await waitFor(() => rows(host).includes("site.css"));

    const name = async (text: string) => {
      click(host.querySelector('[aria-label="New stylesheet"]')!);
      const dialog = host.querySelector("dialog")!;
      await waitFor(() => dialog.open);
      type(dialog.querySelector("input")!, text);
      submit(dialog.querySelector("form")!);
      return dialog;
    };

    const taken = await name("site");
    await waitFor(() => taken.textContent!.includes("site.css already exists"));
    click(button(taken, "Cancel")!);

    await name("from-the-list");
    await waitFor(() => resource.peek()?.path === "from-the-list.css");
    expect(host.querySelector("dialog")).toBeNull();
    await deleteResource();
    dispose();
  });

});

describe("themes in the tree", () => {
  afterEach(closeResource);

  test("a folder without one is offered one, and it opens where it was made", async () => {
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rows(host).includes("index.md"));
    const offer = () => host.querySelector('[aria-label="New theme"]');
    expect(offer()).toBeNull(); // the root has one already

    click(row(host, "blog"));
    await waitFor(() => rows(host).includes("one-page-that-looks-different.md"));
    expect(rows(host)).toContain("-theme.css"); // the seed's, showing the cascade
    expect(offer()).toBeNull();

    click(row(host, ".."));
    await waitFor(() => rows(host).includes("guide"));
    click(row(host, "guide"));
    await waitFor(() => rows(host).includes("themes.md"));
    await waitFor(offer);

    click(offer()!);
    // Made in the folder being browsed, opened below as a resource, and
    // listed in the tree from then on — where it says what it themes.
    await waitFor(() => resource.peek()?.path === "guide/-theme.css");
    expect(resource.peek()?.section).toBe("pages");
    await waitFor(() => rows(host).includes("-theme.css"));
    await waitFor(() => offer() === null);

    click(row(host, "-theme.css"));
    await waitFor(() => resourceDraft.peek().includes("body.mytheme"));
    await deleteResource();
    await waitFor(() => !rows(host).includes("-theme.css")); // the tree hears about it
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
    // Not a page, but in the tree all the same: which folder it sits in is
    // what it means. It opens below, as a resource, not as content.
    const themeRow = row(host, "-theme.css");
    expect(themeRow.className).toBe("resource");
    expect(themeRow.querySelector(".lucide-droplet")).not.toBeNull();
    expect(row(host, "index.md").querySelector(".lucide-file-text")).not.toBeNull();

    click(row(host, "guide"));
    await waitFor(() => rows(host).includes("pages.md"));
    expect(host.querySelector(".browser-header")!.textContent).toContain("/guide");
    click(row(host, ".."));
    await waitFor(() => rows(host).includes("guide")); // guide/ has an index.md too: wait for the root

    click(row(host, "index.md"));
    await waitFor(() => filePath.get() === "index.md");
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

describe("Editor", () => {
  test("saves, flags a save that failed, and saves on ⌘⏎ only when there's something to save", async () => {
    await createFile("/editor-test.md", "editor-test.md");
    const { host, dispose } = render(() => <Editor />);
    const area = host.querySelector("textarea")!;
    const save = button(host, "Save")!;
    expect(host.querySelector(".pane-header .pane-name")!.textContent).toBe("editor-test.md");
    expect(area.value).toBe("title: editor-test\n\n");

    type(area, "title: editor-test\n\n# Edited");
    expect(save.className).toBe("primary"); // dirty
    click(save);
    await waitFor(() => save.textContent!.includes("Saved"));
    expect(save.className).toBe("saved");
    expect(fileContent.get()).toBe("title: editor-test\n\n# Edited");
    await waitFor(() => save.textContent!.includes("Save") && !save.textContent!.includes("Saved"), 2500);
    expect(save.className).toBe("");

    type(area, "title: editor-test\n\n# Unsaved");
    const restore = intercept(() => new Response("disk full", { status: 507 }));
    try {
      click(save);
      await waitFor(() => save.textContent!.includes("Not saved"));
      expect(save.className).toBe("danger");
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
    editorContent.set("title: Typed\ntheme: dark\n\n# Hello [[other]]"); // within the debounce: replaces the first
    await waitFor(() => frame(host).srcdoc.includes("Hello"));
    const doc = frame(host).srcdoc;
    expect(doc).toContain("<title>Typed</title>");
    expect(doc).toContain('<link href="/static/site.css" rel="stylesheet">');
    expect(doc).toContain("<style>/* The duckdown theme"); // the root's, inherited by My folder/
    expect(doc).toContain('href="/My%20folder/other.html"'); // the wiki link, from where the page lives
    expect(doc).toContain('<body class="dark">');
    dispose();
  });

  test("with no file open, a bare page gets the defaults and the root theme", async () => {
    editorContent.set("Just text");
    const { host, dispose } = render(() => <Preview />);
    await waitFor(() => frame(host).srcdoc.includes("Just text"));
    expect(frame(host).srcdoc).toContain("<style>/* The duckdown theme");
    expect(frame(host).srcdoc).toContain("<title>duckie</title>"); // the site's default title
    expect(frame(host).srcdoc).toContain('<body class="">');
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
  test("shows the CSS on sample content, with the body class it styles", () => {
    editorContent.set("body.mytheme { color: red }");
    const { host, dispose } = render(() => <CssPreview css={() => editorContent.get()} />);
    const doc = (host.querySelector("iframe") as HTMLIFrameElement).srcdoc;
    expect(doc).toContain("<style>body.mytheme { color: red }</style>");
    expect(doc).toContain('<body class="mytheme">');
    editorContent.set("p { margin: 0 }");
    expect((host.querySelector("iframe") as HTMLIFrameElement).srcdoc).toContain('<body class="">');
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
    click(button(host, "Resources")!);
    expect(showImages.get()).toBe(true);
    const logout = host.querySelector("form.header-form") as HTMLFormElement;
    expect(logout.getAttribute("method")).toBe("post");
    expect(logout.getAttribute("action")).toBe("/logout");
    dispose();
  });
});

describe("ImageBrowser", () => {
  test("browses, previews, copies, makes folders, uploads, and closes", async () => {
    const writeText = mock((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { host, dispose } = render(() => <ImageBrowser />);
    await waitFor(() => rows(host).includes("logo.svg"));
    expect(row(host, "logo.svg").querySelector("img")!.getAttribute("src")).toBe("/edit/browse/logo.svg?thumb=32");

    click(row(host, "logo.svg"));
    await waitFor(() => host.querySelector(".image-preview"));
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
    await waitFor(() => host.querySelector(".browser-header")!.textContent!.includes("/My shots"));

    // Upload into it: nothing chosen does nothing; a file lands and is listed
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [], configurable: true });
    input.dispatchEvent(new Event("change"));
    Object.defineProperty(input, "files", { value: [new File(["<svg/>"], "a b.svg", { type: "image/svg+xml" })], configurable: true });
    input.dispatchEvent(new Event("change"));
    await waitFor(() => rows(host).includes("a b.svg"));
    expect(row(host, "a b.svg").querySelector("img")!.getAttribute("src")).toBe("/edit/browse/My%20shots/a%20b.svg?thumb=32");
    click(row(host, "a b.svg"));
    await waitFor(() => host.querySelector(".image-preview"));
    expect(host.querySelector(".image-preview img")!.getAttribute("src")).toBe("/static/images/My%20shots/a%20b.svg");

    click(row(host, ".."));
    await waitFor(() => rows(host).includes("My shots"));
    click(row(host, "My shots"));
    await waitFor(() => rows(host).includes("a b.svg"));

    click(host.querySelector('[aria-label="Close resources"]')!);
    expect(showImages.get()).toBe(false);
    dispose();
  });

  test("three tabs over one sidebar: images, css, templates", async () => {
    const { host, dispose } = render(() => <ImageBrowser />);
    await waitFor(() => rows(host).includes("logo.svg"));
    const tab = (name: string) => button(host.querySelector(".browser-sections")!, name)!;
    expect(tab("images").className).toBe("section on");

    click(tab("css"));
    await waitFor(() => rows(host).includes("site.css"));
    expect(tab("css").className).toBe("section on");
    expect(tab("images").className).toBe("section");
    expect(host.querySelector(".upload-area")).toBeNull(); // the images tab stepped aside

    click(tab("templates"));
    await waitFor(() => rows(host).includes("site.html"));
    expect(host.querySelector(".pane-path")!.textContent).toBe("/templates");

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
      expect(host.querySelector(".browser-header span")!.textContent).toBe("/"); // stayed put
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

    await loadFile("-theme.css");
    await waitFor(() => previewFrame()?.srcdoc.includes("Wobbling duck"));

    // Neither markdown nor CSS: say so rather than render it as prose.
    filePath.set("odd.txt");
    await waitFor(() => app.querySelector(".panel-preview .placeholder") !== null);
    expect(app.querySelector(".panel-preview .placeholder")!.textContent).toBe("no preview for this kind of file");

    filePath.set(null);
    expect(app.querySelector(".panel-editor .placeholder")!.textContent).toBe("select a page or a resource");
    expect(app.querySelector(".panel-preview .placeholder")!.textContent).toBe("preview");

    showImages.set(true);
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
