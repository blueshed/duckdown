import { createElement, Fragment, signal, computed, effect, list, when } from "@blueshed/railroad";
import type { FileEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { byName } from "./Browser";
import { apiJson, urlPath } from "../api";
import {
  filePath, resourceRevision, openResource, createResource, createTheme, type Resource,
} from "../store";
import { NewDialog } from "./NewDialog";

// Every -theme.css between the site root and the open page: exactly the ones
// the server will cascade onto it, in the order it applies them. A theme lives
// in pages/ so the cascade can find it, which is why it isn't in static/ — but
// it is styling, so this is where you reach it.
async function themesFor(page: string | null): Promise<FileEntry[]> {
  const dirs = [""];
  let acc = "";
  for (const part of (page ?? "").split("/").slice(0, -1)) {
    acc = acc ? `${acc}/${part}` : part;
    dirs.push(acc);
  }
  const found: FileEntry[] = [];
  for (const dir of dirs) {
    const data = await apiJson<Listing>(`list /${dir}`, `/edit/pages/${urlPath(dir)}`);
    const theme = data?.files.find((f) => f.name === "-theme.css");
    if (theme) found.push(theme);
  }
  return found;
}

// The stylesheets and templates a page is composed with. Not content: there is
// no structure here worth navigating, so it is a flat list you reach for —
// picking one opens it below the page, against the page you are looking at.
export function ResourceList({ section }: { section: "templates" | "static" }) {
  const files = signal<FileEntry[]>([]);
  const themes = signal<FileEntry[]>([]);
  const naming = signal(false);

  // The folder the open page is in, where a theme of its own would go.
  const pageDir = computed(() => filePath.get()?.split("/").slice(0, -1).join("/") ?? null);
  const canTheme = computed(() =>
    section === "static"
    && pageDir.get() !== null
    && !themes.get().some((t) => t.path.replace(/^\//, "") === `${pageDir.get() ? `${pageDir.get()}/` : ""}-theme.css`));

  effect(() => {
    resourceRevision.get();
    apiJson<Listing>(`list ${section}`, `/edit/${section}/`).then((data) => {
      if (!data) return;
      // static/ holds images too, and those are picked from the images tab.
      const ext = section === "templates" ? ".html" : ".css";
      files.set(data.files.filter((f) => f.name.endsWith(ext)).sort(byName));
    });
  });

  effect(() => {
    resourceRevision.get();
    if (section === "static") themesFor(filePath.get()).then((found) => themes.set(found));
  });

  const open = (path: string, at: Resource["section"] = section) =>
    openResource({ section: at, path: path.replace(/^\//, "") } as Resource);

  const icon = section === "templates" ? "layout-template" : "droplet";

  return (
    <>
      <div class="browser-header">
        <span class="pane-path">/{section}</span>
        {when(canTheme, () => (
          <button class="icon-btn" aria-label="New theme" title="New theme for this page's folder"
            onclick={() => createTheme(pageDir.peek() ?? "")}>
            <Icon name="droplet" />
          </button>
        ))}
        <button class="icon-btn" aria-label={`New ${section === "templates" ? "template" : "stylesheet"}`}
          title={`New ${section === "templates" ? "template" : "stylesheet"}`} onclick={() => naming.set(true)}>
          <Icon name="file-plus" />
        </button>
      </div>

      <div class="sidebar-content">
        <ul class="file-list">
          {list(files, (f) => f.path, (row) => (
            <li onclick={() => open(row.peek().name)}>
              <Icon name={icon} size={12} /> {row.map((f) => f.name)}
            </li>
          ))}
        </ul>

        {when(() => themes.get().length > 0, () => (
          <>
            <p class="file-group">themes on this page</p>
            <ul class="file-list">
              {list(themes, (f) => f.path, (row) => (
                <li onclick={() => open(row.peek().path, "pages")}>
                  <Icon name="droplet" size={12} /> {row.map((f) => f.path)}
                </li>
              ))}
            </ul>
          </>
        ))}
      </div>

      {when(naming, () => (
        <NewDialog
          kind={section === "templates" ? "template" : "stylesheet"}
          oncreate={async (name) => {
            const error = await createResource(section, name);
            if (error) return error;
            naming.set(false);
          }}
          oncancel={() => naming.set(false)}
        />
      ))}
    </>
  );
}
