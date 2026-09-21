import { createElement, Fragment, signal, effect, list, when } from "@blueshed/railroad";
import type { FileEntry, Listing } from "../../storage";
import { Icon } from "./Icon";
import { byName } from "./Browser";
import { apiJson } from "../api";
import { resourceRevision, openResource, createResource, type Resource } from "../store";
import { NewDialog } from "./NewDialog";

// The stylesheets in static/ and the templates in templates/: what a page is
// composed with, wherever it lives. Flat on purpose — neither folder has a
// structure worth navigating, and neither file belongs to one page.
//
// A theme is not here. It lives in pages/, in the folder it themes, and that
// placement is what it means — so it stays in the tree, where the folders are.
export function ResourceList({ section }: { section: "templates" | "static" }) {
  const files = signal<FileEntry[]>([]);
  const naming = signal(false);
  const kind = section === "templates" ? "template" : "stylesheet";

  effect(() => {
    resourceRevision.get();
    apiJson<Listing>(`list ${section}`, `/edit/${section}/`).then((data) => {
      if (!data) return;
      // static/ holds images too, and those are picked from the images tab.
      const ext = section === "templates" ? ".html" : ".css";
      files.set(data.files.filter((f) => f.name.endsWith(ext)).sort(byName));
    });
  });

  return (
    <>
      <div class="browser-header">
        <span class="pane-path">/{section}</span>
        <button class="icon-btn" aria-label={`New ${kind}`} title={`New ${kind}`} onclick={() => naming.set(true)}>
          <Icon name="file-plus" />
        </button>
      </div>

      <div class="sidebar-content">
        <ul class="file-list">
          {list(files, (f) => f.path, (row) => (
            <li onclick={() => openResource({ section, path: row.peek().name } as Resource)}>
              <Icon name={section === "templates" ? "layout-template" : "droplet"} size={12} />
              {row.map((f) => f.name)}
            </li>
          ))}
        </ul>
      </div>

      {when(naming, () => (
        <NewDialog
          kind={kind}
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
