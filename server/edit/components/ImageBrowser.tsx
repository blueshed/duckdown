import { createElement, Fragment, signal, computed, list, when } from "@blueshed/railroad";
import type { FileEntry, FolderEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { byName } from "./Browser";
import { api, apiJson, urlPath } from "../api";
import { speak } from "../notice";
import { closeImages } from "../store";
import { modal } from "../modal";
import { ResourceList } from "./ResourceList";
import { ReportList } from "./ReportList";
import { Drawer } from "./Drawer";
import { Trail, folderCrumbs } from "./Trail";

type Tab = "images" | "styles" | "templates" | "reports";
const TABS: [Tab, string][] = [["images", "images"], ["styles", "css"], ["templates", "templates"], ["reports", "reports"]];

export function ImageBrowser() {
  const files = signal<FileEntry[]>([]);
  const folders = signal<FolderEntry[]>([]);
  const path = signal("");
  const imgPath = signal("/static/images/");
  const selected = signal<string | null>(null);
  const uploading = signal(false);
  const showFolderInput = signal(false);
  const folderName = signal("");

  const load = async (folder: string) => {
    path.set(folder);
    selected.set(null);
    const data = await apiJson<Listing>(`list images/${folder}`, `/edit/browse/${urlPath(folder)}`);
    if (!data) return;
    files.set(data.files.sort(byName));
    folders.set(data.folders.sort(byName));
  };

  const loadImgPath = async () => {
    const data = await apiJson<{ img_path: string }>("find the images folder", "/edit/browse/", { method: "PUT" });
    if (data) imgPath.set(data.img_path);
  };

  const upload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    uploading.set(true);
    const form = new FormData();
    for (const file of input.files) form.append("file", file);
    await api(`upload to images/${path.peek()}`, `/edit/browse/${urlPath(path.peek())}`, { method: "POST", body: form });
    input.value = "";
    uploading.set(false);
    load(path.peek());
  };

  const createFolder = async () => {
    const name = folderName.peek();
    showFolderInput.set(false);
    folderName.set("");
    if (name) {
      const p = path.peek();
      const newPath = p ? `${p}/${name}` : name;
      const res = await api(`create images/${newPath}`, `/edit/browse/${urlPath(newPath)}`, { method: "PUT" });
      if (res.ok) load(newPath);
    }
  };

  const imageUrl = computed(() => {
    const name = selected.get();
    if (!name) return "";
    const p = path.get();
    return `${imgPath.get()}${urlPath(p ? `${p}/${name}` : name)}`;
  });

  // Only reachable while an image is selected (the button lives in that branch).
  const copyMarkdown = () =>
    navigator.clipboard.writeText(`![${selected.peek()}](${imageUrl.peek()})`)
      .catch(() => speak("Couldn't copy to the clipboard: the browser refused."));

  loadImgPath();
  load("");

  // Three kinds of resource, one chooser. Images are inserted into the page at
  // the cursor; a stylesheet or a template opens below the page to be edited.
  // And what the site's own tasks reported, to read.
  const tab = signal<Tab>("images");
  const on = (name: string) => tab.map((t) => (t === name ? "section on" : "section"));

  // Tabs as a screen reader knows them (role=tab, the chosen one selected),
  // and as a keyboard expects: Tab reaches the chosen one, the arrows (and
  // Home, End) move along them.
  const arrows = (e: KeyboardEvent) => {
    const at = TABS.findIndex(([name]) => name === tab.peek());
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const [name] = TABS[(to + TABS.length) % TABS.length]!;
    tab.set(name);
    (e.currentTarget as HTMLElement).querySelector<HTMLElement>(`#tab-${name}`)!.focus();
  };

  return (
    <Drawer icon="layout-template" title="Resources" close="Close resources" onclose={closeImages}>

      <div class="browser-sections" role="tablist" aria-label="Resources" onkeydown={arrows}>
        {TABS.map(([name, label]) => (
          <button class={on(name)} role="tab" id={`tab-${name}`} onclick={() => tab.set(name)}
            aria-selected={tab.map((t) => String(t === name))}
            tabindex={tab.map((t) => (t === name ? "0" : "-1"))}>{label}</button>
        ))}
      </div>

      <div class="tab-panel" role="tabpanel" aria-labelledby={tab.map((t) => `tab-${t}`)}>
      {when(tab.map((t) => t === "styles"), () => <ResourceList section="static" />)}
      {when(tab.map((t) => t === "templates"), () => <ResourceList section="templates" />)}
      {when(tab.map((t) => t === "reports"), () => <ReportList />)}

      {when(tab.map((t) => t === "images"), () => <>
      <div class="browser-header">
        <Trail label="Folder of images" crumbs={() => folderCrumbs("images", path.get(), load)} />
        <span class="pane-gap" />
        <button class="icon-btn" aria-label="New folder" title="New folder" onclick={() => showFolderInput.set(true)}>
          <Icon name="folder-plus" />
        </button>
      </div>

      <div class="sidebar-content">
        <ul class="file-list">
          {/* Keyed rows get a signal per row, not the item: read it with .map/.peek */}
          {list(folders, (f) => f.path, (f$) => (
            <li class="folder">
              <button class="row" onclick={() => load(f$.peek().path.replace(/^\//, ""))}>
                <Icon name="folder" size={12} /> {f$.map((f) => f.name)}
              </button>
            </li>
          ))}
        </ul>
        {/* Pictures, drawn as pictures; the chosen one rings. */}
        <ul class="file-list pictures">
          {list(files, (f) => f.path, (f$) => (
            <li>
              <button class="row" onclick={() => selected.set(f$.peek().name)}
                aria-pressed={computed(() => String(selected.get() === f$.get().name))}>
                <img class="thumb" src={f$.map((f) => `/edit/browse${urlPath(f.path)}?thumb=160`)} alt="" loading="lazy" />
                <span class="row-label">{f$.map((f) => f.name)}</span>
              </button>
            </li>
          ))}
        </ul>

        {when(selected, () => (
          <div class="image-preview">
            <img src={imageUrl} alt={selected} />
            <button onclick={copyMarkdown}>
              <Icon name="copy" /> Copy Markdown
            </button>
          </div>
        ))}

        <div class="upload-area">
          <label class="upload-label">
            <Icon name="upload" /> {when(uploading, () => <span>Uploading...</span>, () => <span>Upload</span>)}
            {/* Hidden from sight, not from the keyboard: Tab reaches it, and the label shows its focus. */}
            <input type="file" multiple onchange={upload} class="visually-hidden" />
          </label>
        </div>
      </div>
      </>)}
      </div>

      {when(showFolderInput, () => {
        const dialog = modal();
        return (
          <dialog ref={dialog.ref} class="dialog" aria-labelledby={dialog.title}
            onclose={() => showFolderInput.set(false)}>
            <form onsubmit={(e: Event) => { e.preventDefault(); createFolder(); }}>
              <h3 id={dialog.title}>New folder</h3>
              <input
                type="text"
                aria-label="Folder name"
                placeholder="folder-name"
                autofocus
                oninput={(e: Event) => folderName.set((e.target as HTMLInputElement).value)}
              />
              <div class="dialog-actions">
                <button type="button" onclick={() => { dialog.close(); showFolderInput.set(false); }}>Cancel</button>
                <button type="submit" class="primary">Create</button>
              </div>
            </form>
          </dialog>
        );
      })}
    </Drawer>
  );
}
