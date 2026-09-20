import { createElement, signal, effect, list, when } from "@blueshed/railroad";
import type { FileEntry, FolderEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { NewDialog } from "./NewDialog";
import { apiJson, urlPath } from "../api";
import { loadFile, createFile, browserRevision } from "../store";

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function Browser() {
  const files = signal<FileEntry[]>([]);
  const folders = signal<FolderEntry[]>([]);
  const path = signal("");
  const showNew = signal(false);
  const hasTheme = signal(false);

  const load = async (folder: string) => {
    path.set(folder);
    const data = await apiJson<Listing>(`list /${folder}`, `/edit/pages/${urlPath(folder)}`);
    if (!data) return;
    files.set(data.files.sort(byName));
    folders.set(data.folders.sort(byName));
    hasTheme.set(data.files.some((f) => f.name === "-theme.css"));
  };

  // Resolves to a message (the name is taken) to keep the dialog open with.
  const onCreate = async (type: "page" | "folder" | "theme", name: string): Promise<string | void> => {
    const dir = `/${path.peek() ? path.peek() + "/" : ""}`;
    const error =
      type === "theme" ? await createFile(`${dir}-theme.css`, "-theme.css")
      : type === "folder" ? await createFile(`${dir}${name}/index.md`, name)
      : await createFile(`${dir}${name.endsWith(".md") ? name : `${name}.md`}`, name);
    if (error) return error;
    showNew.set(false);
  };

  // Reload when browserRevision changes
  effect(() => {
    browserRevision.get();
    load(path.peek());
  });

  return (
    <div class="panel panel-browser">
      <div class="browser-header">
        <span style="flex:1; font-size: 12px; color: var(--text-dim);">/{path}</span>
        <button onclick={() => showNew.set(true)}>
          <Icon name="plus" /> New
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
          <li onclick={() => loadFile(f$.peek().path)}>
            <Icon name={f$.peek().name.endsWith(".css") ? "droplet" : "file-text"} size={12} /> {f$.map((f) => f.name)}
          </li>
        ))}
      </ul>
      {when(showNew, () => (
        <NewDialog
          hasTheme={hasTheme.peek()}
          oncreate={onCreate}
          oncancel={() => showNew.set(false)}
        />
      ))}
    </div>
  );
}
