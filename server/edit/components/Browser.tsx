import { createElement, signal, effect, list, when } from "@blueshed/railroad";
import type { FileEntry, FolderEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { NewDialog, type NewKind } from "./NewDialog";
import { apiJson, urlPath } from "../api";
import { loadFile, createFile, createTheme, openResource, browserRevision } from "../store";

export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

export function Browser() {
  const files = signal<FileEntry[]>([]);
  const folders = signal<FolderEntry[]>([]);
  const theme = signal<FileEntry | null>(null);
  const path = signal("");
  const newKind = signal<NewKind | null>(null);

  const load = async (folder: string) => {
    path.set(folder);
    const data = await apiJson<Listing>(`list /${folder}`, `/edit/pages/${urlPath(folder)}`);
    if (!data) return;
    files.set(data.files.filter((f) => f.name.endsWith(".md")).sort(byName));
    folders.set(data.folders.sort(byName));
    // A -theme.css is not a page — nobody reads it — but it belongs here all
    // the same: which folder it sits in is what it means, because that is the
    // folder it themes, and everything under it. Say it by where it is, then
    // open it as what it is, in the pane below.
    theme.set(data.files.find((f) => f.name === "-theme.css") ?? null);
  };

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
        {when(() => theme.get() === null, () => (
          <button class="icon-btn" aria-label="New theme" title="New theme for this folder"
            onclick={() => createTheme(path.peek())}>
            <Icon name="droplet" />
          </button>
        ))}
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
            <Icon name="file-text" size={12} /> {f$.map((f) => f.name)}
          </li>
        ))}
        {when(theme, () => (
          <li class="resource" title="The theme for this folder and the ones under it"
            onclick={() => openResource({ section: "pages", path: theme.peek()!.path.replace(/^\//, "") })}>
            <Icon name="droplet" size={12} /> -theme.css
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
