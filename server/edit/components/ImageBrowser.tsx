import { createElement, signal, computed, list, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { closeImages } from "../store";

export function ImageBrowser() {
  const files = signal<any[]>([]);
  const folders = signal<any[]>([]);
  const path = signal("");
  const imgPath = signal("/static/images/");
  const selected = signal<string | null>(null);
  const uploading = signal(false);
  const showFolderInput = signal(false);
  const folderName = signal("");

  const load = async (folder: string) => {
    path.set(folder);
    selected.set(null);
    try {
      const res = await fetch(`/edit/browse/${folder}`);
      if (!res.ok) return;
      const data = await res.json();
      files.set((data.files || []).sort((a: any, b: any) => a.name.localeCompare(b.name)));
      folders.set((data.folders || []).sort((a: any, b: any) => a.name.localeCompare(b.name)));
    } catch {}
  };

  const loadImgPath = async () => {
    try {
      const res = await fetch("/edit/browse/", { method: "PUT" });
      if (res.ok) {
        const data = await res.json();
        imgPath.set(data.img_path || imgPath.peek());
      }
    } catch {}
  };

  const upload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    uploading.set(true);
    const form = new FormData();
    for (const file of input.files) form.append("file", file);
    await fetch(`/edit/browse/${path.peek()}`, { method: "POST", body: form });
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
      await fetch(`/edit/browse/${newPath}`, { method: "PUT" });
      load(newPath);
    }
  };

  const imageUrl = computed(() => {
    const name = selected.get();
    if (!name) return "";
    const p = path.get();
    return `${imgPath.get()}${p ? p + "/" : ""}${name}`;
  });

  const copyMarkdown = () => {
    const name = selected.peek();
    if (!name) return;
    const url = imageUrl.peek();
    navigator.clipboard.writeText(`![${name}](${url})`);
  };

  loadImgPath();
  load("");

  return (
    <div class="sidebar">
      <div class="sidebar-header">
        <span style="flex:1; font-weight: 600;">Images</span>
        <button onclick={closeImages}>
          <Icon name="x" />
        </button>
      </div>

      <div class="browser-header">
        <span style="flex:1; font-size: 12px; color: var(--text-dim);">/{path}</span>
        <button onclick={() => showFolderInput.set(true)}>
          <Icon name="folder-plus" /> New
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
          {list(folders, (f: any) => f.path, (f: any) => (
            <li class="folder" onclick={() => load(f.path.replace(/^\//, ""))}>
              <Icon name="folder" size={12} /> {f.name}
            </li>
          ))}
          {list(files, (f: any) => f.path, (f: any) => (
            <li onclick={() => selected.set(f.name)}>
              <Icon name="image" size={12} /> {f.name}
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
