import { createElement, signal, effect, list, when } from "@blueshed/railroad";
import type { FileEntry, FolderEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { NewDialog, type NewKind } from "./NewDialog";
import { apiJson, urlPath } from "../api";
import { loadFile, createFile, browserRevision, openCollection, COLLECTION_FILE } from "../store";

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function Browser() {
  const files = signal<FileEntry[]>([]);
  const folders = signal<FolderEntry[]>([]);
  const path = signal("");
  const newKind = signal<NewKind | null>(null);

  const load = async (folder: string) => {
    path.set(folder);
    const data = await apiJson<Listing>(`list /${folder}`, `/edit/pages/${urlPath(folder)}`);
    if (!data) return;
    // Pages, and the one other file that lives in pages/: a folder's
    // collection.json, which is pages too — a hundred of them, written once.
    // Everything a page is composed with — templates, stylesheets, images —
    // lives outside pages/ and is reached from Resources.
    files.set(data.files
      .filter((f) => f.name.endsWith(".md") || f.name === COLLECTION_FILE)
      .sort(byName));
    folders.set(data.folders.sort(byName));
  };

  // A collection opens as a pane, not as the JSON it is written in.
  const open = (file: FileEntry) =>
    file.name === COLLECTION_FILE ? openCollection(path.peek()) : loadFile(file.path);

  // Resolves to a message (the name is taken) to keep the dialog open with.
  const onCreate = async (name: string): Promise<string | void> => {
    const dir = `/${path.peek() ? path.peek() + "/" : ""}`;
    const error = newKind.peek() === "folder"
      ? await createFile(`${dir}${name}/index.md`, name)
      : await createFile(`${dir}${name.endsWith(".md") ? name : `${name}.md`}`, name);
    if (error) return error;
    newKind.set(null);
  };

  // Reload when browserRevision changes
  effect(() => {
    browserRevision.get();
    load(path.peek());
  });

  return (
    <div class="panel panel-browser">
      <div class="browser-header">
        <span class="pane-path">/{path}</span>
        <button class="icon-btn" aria-label="New page" title="New page" onclick={() => newKind.set("page")}>
          <Icon name="file-plus" />
        </button>
        <button class="icon-btn" aria-label="New folder" title="New folder" onclick={() => newKind.set("folder")}>
          <Icon name="folder-plus" />
        </button>
      </div>
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
          <li onclick={() => open(f$.peek())}>
            <Icon name={f$.peek().name === COLLECTION_FILE ? "layout-grid" : "file-text"} size={12} />
            {" "}{f$.map((f) => f.name)}
          </li>
        ))}
      </ul>
      {when(newKind, () => (
        <NewDialog
          kind={newKind.peek()!}
          oncreate={onCreate}
          oncancel={() => newKind.set(null)}
        />
      ))}
    </div>
  );
}
