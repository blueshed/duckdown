// The editor's own code, in happy-dom, talking to the real server in this
// process (signed in). Failures are staged with intercept().
import { describe, test, expect, beforeAll, afterAll, afterEach, spyOn, mock } from "bun:test";
import { createElement, mount, batch } from "@blueshed/railroad";
import { BASE, signIn, waitFor } from "./helpers";
import { api, apiJson, urlPath } from "../server/edit/api";
import { notice, speak, hush } from "../server/edit/notice";
import {
  filePath, fileContent, editorContent, showImages, browserRevision,
  loadFile, createFile, saveFile, deleteFile, reloadBrowser, toggleImages, closeImages,
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

  test("createFile makes a page or a theme, and never overwrites", async () => {
    const before = browserRevision.get();
    expect(await createFile("/store-made.md", "store-made.md")).toBeUndefined();
    expect(editorContent.get()).toBe("title: store-made\n\n");
    expect(browserRevision.get()).toBe(before + 1);
    expect(await createFile("/store-made.md", "store-made.md")).toBe("store-made.md already exists");
    expect(await createFile("/store-folder/-theme.css", "-theme.css")).toBeUndefined();
    expect(editorContent.get()).toStartWith("/* Theme CSS for this folder */");
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
  test("asks for a name, keeps an error until the name changes, and goes back or away", async () => {
    const oncreate = mock(async (_type: string, name: string) => (name === "taken" ? "taken.md already exists" : undefined));
    const oncancel = mock(() => {});
    const { host, dispose } = render(() => <NewDialog hasTheme={false} oncreate={oncreate} oncancel={oncancel} />);
    const dialog = host.querySelector("dialog")!;
    await waitFor(() => dialog.open);

    click(button(dialog, "Folder")!);
    expect(dialog.querySelector("input")!.placeholder).toBe("folder-name");
    click(button(dialog, "Back")!);
    click(button(dialog, "Page")!);
    const input = dialog.querySelector("input")!;
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
    expect(oncreate).toHaveBeenLastCalledWith("page", "fine");

    click(button(dialog, "Back")!);
    click(button(dialog, "Theme")!);
    await settle();
    expect(oncreate).toHaveBeenLastCalledWith("theme", "-theme.css");
    click(button(dialog, "Cancel")!);
    expect(oncancel).toHaveBeenCalled();
    dialog.close(); // Escape, say
    expect(oncancel.mock.calls.length).toBeGreaterThan(1);
    dispose();
  });

  test("offers no Theme where the folder has one", async () => {
    const { host, dispose } = render(() => <NewDialog hasTheme={true} oncreate={async () => {}} oncancel={() => {}} />);
    expect(button(host, "Theme")).toBeUndefined();
    dispose();
  });
});

describe("Browser", () => {
  test("lists the site, walks folders, and opens files", async () => {
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rows(host).includes("index.md"));
    expect(rows(host)).toContain("guide");
    expect(row(host, "-theme.css").querySelector(".lucide-droplet")).not.toBeNull();
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

  test("New makes pages, folders and themes, and keeps the dialog open to say a name is taken", async () => {
    const { host, dispose } = render(() => <Browser />);
    await waitFor(() => rows(host).includes("index.md"));
    const create = async (kind: string, name?: string) => {
      click(button(host, "New")!);
      const dialog = host.querySelector("dialog")!;
      await waitFor(() => dialog.open);
      click(button(dialog, kind)!);
      if (name !== undefined) {
        type(dialog.querySelector("input")!, name);
        submit(dialog.querySelector("form")!);
      }
      return dialog;
    };

    expect(button((await create("Page")) as HTMLElement, "Theme")).toBeUndefined; // root has one
    click(button(host.querySelector("dialog")!, "Back")!);
    expect(button(host.querySelector("dialog")!, "Theme")).toBeUndefined();
    click(button(host.querySelector("dialog")!, "Cancel")!);

    const taken = await create("Page", "index");
    await waitFor(() => taken.textContent!.includes("index.md already exists"));
    click(button(taken, "Back")!);
    click(button(taken, "Cancel")!);

    await create("Page", "browser-page");
    await waitFor(() => filePath.get() === "browser-page.md");
    expect(host.querySelector("dialog")).toBeNull();

    await create("Folder", "browser-folder");
    await waitFor(() => filePath.get() === "browser-folder/index.md");
    expect(editorContent.get()).toBe("title: browser-folder\n\n");

    click(row(host, "guide"));
    await waitFor(() => rows(host).includes("pages.md"));
    await create("Theme");
    await waitFor(() => filePath.get() === "guide/-theme.css");
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
    expect(host.querySelector(".editor-toolbar span")!.textContent).toBe("editor-test.md");
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
    const trash = host.querySelector('[aria-label="Delete file"]')!;
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
    expect(frame(host).srcdoc).toContain("<title>preview</title>");
    expect(frame(host).srcdoc).toContain('<body class="">');
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
    const { host, dispose } = render(() => <CssPreview />);
    const doc = (host.querySelector("iframe") as HTMLIFrameElement).srcdoc;
    expect(doc).toContain("<style>body.mytheme { color: red }</style>");
    expect(doc).toContain('<body class="mytheme">');
    editorContent.set("p { margin: 0 }");
    expect((host.querySelector("iframe") as HTMLIFrameElement).srcdoc).toContain('<body class="">');
    dispose();
  });
});

describe("Header", () => {
  test("links View to the open page, toggles images, and logs out by POST", () => {
    const { host, dispose } = render(() => <Header />);
    const view = [...host.querySelectorAll("a")].find((a) => a.textContent!.includes("View"))!;
    expect(view.getAttribute("href")).toBe("/");
    filePath.set("My folder/a b.md");
    expect(view.getAttribute("href")).toBe("/My%20folder/a%20b.html");
    click(button(host, "Images")!);
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
      click(button(host, "New")!);
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

    click(host.querySelector('[aria-label="Close images"]')!);
    expect(showImages.get()).toBe(false);
    dispose();
  });

  test("the folder dialog cancels, and a folder that can't be made speaks", async () => {
    const { host, dispose } = render(() => <ImageBrowser />);
    await waitFor(() => rows(host).includes("logo.svg"));
    click(button(host, "New")!);
    let dialog = host.querySelector("dialog")!;
    await waitFor(() => dialog.open);
    click(button(dialog, "Cancel")!);
    expect(host.querySelector("dialog")).toBeNull();

    click(button(host, "New")!);
    dialog = host.querySelector("dialog")!;
    await waitFor(() => dialog.open);
    dialog.close(); // Escape
    expect(host.querySelector("dialog")).toBeNull();

    const restore = intercept(() => new Response("read-only", { status: 403 }));
    try {
      click(button(host, "New")!);
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

    filePath.set(null);
    expect(app.querySelector(".panel-editor .placeholder")!.textContent).toBe("select a file");
    expect(app.querySelector(".panel-preview .placeholder")!.textContent).toBe("preview");

    showImages.set(true);
    expect(app.querySelector(".sidebar")).not.toBeNull();

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
