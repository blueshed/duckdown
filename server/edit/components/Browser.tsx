import { createElement, signal, computed, effect, list, when } from "@blueshed/railroad";
import type { FileEntry, FolderEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { NewDialog, type NewKind } from "./NewDialog";
import { DeletedDialog } from "./History";
import { apiJson, urlPath } from "../api";
import {
  loadFile, createFile, createCollection, browserRevision, openCollection, reloadBrowser, COLLECTION_FILE,
  filePath,
} from "../store";

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function Browser() {
  const files = signal<FileEntry[]>([]);
  const folders = signal<FolderEntry[]>([]);
  const path = signal("");
  const newKind = signal<NewKind | null>(null);
  const deleted = signal(false);

  // A page brought back opens, as it would have if you had just made it; a
  // collection opens in its pane.
  const restored = (key: string) => {
    reloadBrowser();
    if (key === COLLECTION_FILE || key.endsWith(`/${COLLECTION_FILE}`)) {
      return openCollection(key.slice(0, Math.max(key.length - COLLECTION_FILE.length - 1, 0)));
    }
    return loadFile(key);
  };

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
    const kind = newKind.peek();
    const error = kind === "collection"
      ? await createCollection(path.peek(), name)
      : kind === "folder"
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
        <button class="icon-btn" aria-label="New collection" title="New collection" onclick={() => newKind.set("collection")}>
          <Icon name="layout-grid" />
        </button>
        <button class="icon-btn" aria-label="Deleted pages" title="Deleted pages" onclick={() => deleted.set(true)}>
          <Icon name="archive-restore" />
        </button>
      </div>
      {/* Every row is a button, so the tree is Tab and Enter as well as a click. */}
      <ul class="file-list">
        {when(
          () => path.get() !== "",
          () => (
            <li class="folder">
              <button class="row" aria-label="Up a folder" title="Up a folder" onclick={() => load(path.peek().split("/").slice(0, -1).join("/"))}>
                <Icon name="corner-left-up" size={12} /> ..
              </button>
            </li>
          ),
        )}
        {/* Keyed rows get a signal per row, not the item: read it with .map/.peek */}
        {list(folders, (f) => f.path, (f$) => (
          <li class="folder">
            <button class="row" onclick={() => load(f$.peek().path.replace(/^\//, ""))}>
              <Icon name="folder" size={12} /> {f$.map((f) => f.name)}
            </button>
          </li>
        ))}
        {list(files, (f) => f.path, (f$) => (
          <li>
            <button class="row" onclick={() => open(f$.peek())}
              aria-current={computed(() => filePath.get() === f$.get().path.replace(/^\//, "") ? "page" : null)}>
              <Icon name={f$.peek().name === COLLECTION_FILE ? "layout-grid" : "file-text"} size={12} />
              {" "}{f$.map((f) => f.name)}
            </button>
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
      {when(deleted, () => (
        <DeletedDialog section="pages" onrestored={restored} oncancel={() => deleted.set(false)} />
      ))}
    </div>
  );
}
