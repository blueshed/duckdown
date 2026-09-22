import { createElement, computed, when } from "@blueshed/railroad";
import { PaneHeader } from "./PaneHeader";
import {
  resource, resourceDraft, resourceDirty, pageLayout, pageIncludes,
  closeResource, saveResource, deleteResource,
} from "../store";

// A template or a stylesheet, open below the page rather than instead of it:
// the page stays in the middle and in the preview, and this is what you are
// changing it with. Transient — closing it leaves nothing behind.
export function ResourcePane() {
  const name = computed(() => resource.get()?.path ?? "");
  const icon = computed(() => (resource.get()?.section === "templates" ? "layout-template" : "droplet"));

  // Editing a template the page isn't wearing changes nothing you can see, and
  // silence about that is the confusing part. Say it once and edit anyway —
  // you may well be writing the template you are about to switch to. Worn
  // includes a template reached through {{include}}, not only the one the
  // page's layout: names directly.
  const elsewhere = computed(() => {
    const open = resource.get();
    const worn = pageLayout.get();
    if (open?.section !== "templates" || worn === "") return false;
    return open.path !== worn && !pageIncludes.get().includes(open.path);
  });

  return (
    <div class="panel-resource">
      <PaneHeader
        icon={icon.get()}
        name={name}
        dirty={resourceDirty}
        onsave={saveResource}
        ondelete={deleteResource}
        onclose={closeResource}
      />
      {when(elsewhere, () => (
        <p class="pane-note">
          The page you are looking at uses <code>{pageLayout}</code>, so this one won't show in the preview.
        </p>
      ))}
      <textarea
        spellcheck={false}
        value={resourceDraft}
        oninput={(e: Event) => resourceDraft.set((e.target as HTMLTextAreaElement).value)}
        onkeydown={(e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); saveResource(); }
        }}
      />
    </div>
  );
}
