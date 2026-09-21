import { createElement, computed } from "@blueshed/railroad";
import { PaneHeader } from "./PaneHeader";
import {
  resource, resourceDraft, resourceDirty, closeResource, saveResource, deleteResource,
} from "../store";

// A template or a stylesheet, open below the page rather than instead of it:
// the page stays in the middle and in the preview, and this is what you are
// changing it with. Transient — closing it leaves nothing behind.
export function ResourcePane() {
  const name = computed(() => resource.get()?.path ?? "");
  const icon = computed(() => (resource.get()?.section === "templates" ? "layout-template" : "droplet"));

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
