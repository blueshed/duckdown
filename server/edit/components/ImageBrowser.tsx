import { createElement, Fragment, signal, computed, list, when } from "@blueshed/railroad";
import type { FileEntry, FolderEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { byName } from "./Browser";
import { api, apiJson, urlPath } from "../api";
import { speak } from "../notice";
import { closeImages } from "../store";
import { ResourceList } from "./ResourceList";

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
  const tab = signal<"images" | "styles" | "templates">("images");
  const on = (name: string) => tab.map((t) => (t === name ? "section on" : "section"));

  return (
    <div class="sidebar">
      <div class="sidebar-header">
        <span class="pane-title">Resources</span>
        <button class="icon-btn" aria-label="Close resources" title="Close resources" onclick={closeImages}>
          <Icon name="x" />
        </button>
      </div>

      <div class="browser-sections">
        <button class={on("images")} onclick={() => tab.set("images")}>images</button>
        <button class={on("styles")} onclick={() => tab.set("styles")}>css</button>
        <button class={on("templates")} onclick={() => tab.set("templates")}>templates</button>
      </div>

      {when(tab.map((t) => t === "styles"), () => <ResourceList section="static" />)}
      {when(tab.map((t) => t === "templates"), () => <ResourceList section="templates" />)}

      {when(tab.map((t) => t === "images"), () => <>
      <div class="browser-header">
        <span class="pane-path">/{path}</span>
        <button class="icon-btn" aria-label="New folder" title="New folder" onclick={() => showFolderInput.set(true)}>
          <Icon name="folder-plus" />
        </button>
      </div>

      <div class="sidebar-content">
        <ul class="file-list">
          {when(
            () => path.get() !== "",
            () => (
              <li class="folder" onclick={() => load(path.peek().split("/").slice(0, -1).join("/"))}>
                <Icon name="corner-left-up" size={12} /> ..
              </li>
            ),
          )}
          {/* Keyed rows get a signal per row, not the item: read it with .map/.peek */}
          {list(folders, (f) => f.path, (f$) => (
            <li class="folder" onclick={() => load(f$.peek().path.replace(/^\//, ""))}>
              <Icon name="folder" size={12} /> {f$.map((f) => f.name)}
            </li>
          ))}
          {list(files, (f) => f.path, (f$) => (
            <li onclick={() => selected.set(f$.peek().name)}>
              <img class="thumb" src={f$.map((f) => `/edit/browse${urlPath(f.path)}?thumb=32`)} alt="" loading="lazy" /> {f$.map((f) => f.name)}
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
            <input type="file" multiple onchange={upload} style="display:none;" />
          </label>
        </div>
      </div>
      </>)}

      {when(showFolderInput, () => {
        let dialogRef: HTMLDialogElement | null = null;
        queueMicrotask(() => dialogRef?.showModal());
        return (
          <dialog
            ref={(el: HTMLDialogElement) => { dialogRef = el; }}
            class="dialog"
            onclose={() => showFolderInput.set(false)}
          >
            <form onsubmit={(e: Event) => { e.preventDefault(); createFolder(); }}>
              <h3>New folder</h3>
              <input
                type="text"
                placeholder="folder-name"
                autofocus
                oninput={(e: Event) => folderName.set((e.target as HTMLInputElement).value)}
              />
              <div class="dialog-actions">
                <button type="button" onclick={() => { dialogRef?.close(); showFolderInput.set(false); }}>Cancel</button>
                <button type="submit" class="primary">Create</button>
              </div>
            </form>
          </dialog>
        );
      })}
    </div>
  );
}
