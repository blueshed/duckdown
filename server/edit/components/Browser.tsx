import { createElement, signal, effect, list, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { NewDialog } from "./NewDialog";
import { loadFile, createFile, browserRevision } from "../store";

export function Browser() {
  const files = signal<any[]>([]);
  const folders = signal<any[]>([]);
  const path = signal("");
  const showNew = signal(false);
  const hasTheme = signal(false);

  const load = async (folder: string) => {
    path.set(folder);
    try {
      const res = await fetch(`/edit/pages/${folder}`);
      if (!res.ok) return;
      const data = await res.json();
      files.set((data.files || []).sort((a: any, b: any) => a.name.localeCompare(b.name)));
      folders.set((data.folders || []).sort((a: any, b: any) => a.name.localeCompare(b.name)));
      hasTheme.set(files.peek().some((f: any) => f.name === "-theme.css"));
    } catch {}
  };

  const onCreate = (type: "page" | "folder" | "theme", name: string) => {
    showNew.set(false);
    const p = path.peek();
    if (type === "theme") {
      createFile(`/${p ? p + "/" : ""}-theme.css`, "-theme.css");
    } else if (type === "folder") {
      createFile(`/${p ? p + "/" : ""}${name}/index.md`, "index.md");
    } else {
      const fileName = name.endsWith(".md") ? name : `${name}.md`;
      createFile(`/${p ? p + "/" : ""}${fileName}`, fileName);
    }
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
        {list(folders, (f: any) => f.path, (f: any) => (
          <li class="folder" onclick={() => load(f.path.replace(/^\//, ""))}>
            <Icon name="folder" size={12} /> {f.name}
          </li>
        ))}
        {list(files, (f: any) => f.path, (f: any) => (
          <li onclick={() => loadFile(f.path)}>
            <Icon name={f.name.endsWith(".css") ? "droplet" : "file-text"} size={12} /> {f.name}
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
