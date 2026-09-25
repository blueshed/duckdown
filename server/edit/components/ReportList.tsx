import { createElement, Fragment, signal, list, when } from "@blueshed/railroad";
import type { FileEntry, FolderEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { Trail, folderCrumbs } from "./Trail";
import { apiJson, urlPath } from "../api";

// What the site's own tasks have left in reports/: a folder a month, newest
// first, and a report opens in a tab of its own — it is for reading, not
// editing, and it is written again by whatever wrote it.
export function ReportList() {
  const files = signal<FileEntry[]>([]);
  const folders = signal<FolderEntry[]>([]);
  const path = signal("");
  const newestFirst = <T extends { name: string }>(a: T, b: T) => b.name.localeCompare(a.name);

  const load = async (folder: string) => {
    path.set(folder);
    const data = await apiJson<Listing>(`list reports/${folder}`, `/edit/reports/${urlPath(folder)}`);
    if (!data) return;
    files.set(data.files.filter((f) => f.name.endsWith(".md")).sort(newestFirst));
    folders.set(data.folders.sort(newestFirst));
  };
  load("");

  return (
    <>
      <div class="browser-header">
        <Trail label="Folder of reports" crumbs={() => folderCrumbs("reports", path.get(), load)} />
      </div>

      <div class="sidebar-content">
        <ul class="file-list">
          {list(folders, (f) => f.path, (f$) => (
            <li class="folder">
              <button class="row" onclick={() => load(f$.peek().path)}>
                <Icon name="folder" size={12} /> {f$.map((f) => f.name)}
              </button>
            </li>
          ))}
          {list(files, (f) => f.path, (f$) => (
            <li>
              <a class="report" href={f$.map((f) => `/edit/reports/${urlPath(f.path)}`)} target="_blank" rel="noopener">
                <Icon name="file-text" size={12} /> {f$.map((f) => f.name)}
              </a>
            </li>
          ))}
        </ul>
        {when(
          () => files.get().length === 0 && folders.get().length === 0,
          () => <p class="placeholder">nothing here yet</p>,
        )}
      </div>
    </>
  );
}
