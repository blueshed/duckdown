import { createElement, signal, computed, effect } from "@blueshed/railroad";
import { apiJson } from "../api";
import { Drawer } from "./Drawer";
import { closeDrawer, filePath, editorContent, resource, collection } from "../store";

// Help (routes/help.ts): short pages about writing a page, the site's extras,
// collections, templates, the look and the editor itself — written for the
// person editing, examples first. What fits what is open comes first, and
// open; the rest follow, folded. It follows you: open something else with
// Help showing and it reorders.

type Section = { id: string; title: string; html: string };

// A page whose top says each: true is the pattern every work in its folder
// gets, not a page of its own.
const EACH = /^each\s*:/m;

// The topics that fit what is open, most fitting first.
export function helpFirst(open: {
  file: string | null; text: string; resource: { section: string; path: string } | null; collection: boolean;
}): string[] {
  if (open.resource?.section === "templates") return ["template"];
  if (open.resource?.path.endsWith(".css") || open.file?.endsWith(".css")) return ["look"];
  // The page you are writing wins over the collection open below it.
  const top = open.file?.endsWith(".md") ? open.text.split(/\n\s*\n/, 1)[0] ?? "" : "";
  if (EACH.test(top)) return ["each", "collection"];
  if (open.collection) return ["collection", "each"];
  if (open.file?.endsWith(".md")) return ["page", "top", "extras"];
  return ["editor"];
}

export function helpOrder(sections: Section[], first: string[]): Section[] {
  const at = (s: Section) => { const i = first.indexOf(s.id); return i < 0 ? first.length : i; };
  return [...sections].sort((a, b) => at(a) - at(b));   // stable: the rest keep the base order
}

export function HelpDrawer() {
  const sections = signal<Section[]>([]);
  apiJson<{ sections: Section[] }>("open Help", "/edit/help").then((data) => { if (data) sections.set(data.sections); });

  const order = computed(() => helpOrder(sections.get(), helpFirst({
    file: filePath.get(),
    text: editorContent.get(),
    resource: resource.get(),
    collection: collection.get() !== null,
  })).map((s) => s.id).join(" "));

  // Built afresh when the order changes, so what fits is first and open.
  let body: HTMLElement | null = null;
  effect(() => {
    const ids = order.get();
    if (!body) return;
    const byId = new Map(sections.peek().map((s) => [s.id, s]));
    body.replaceChildren(...ids.split(" ").filter(Boolean).map((id, i) => {
      const s = byId.get(id)!;
      const details = document.createElement("details");
      details.className = "help-section";
      details.dataset.help = s.id;
      details.open = i === 0;
      const summary = document.createElement("summary");
      summary.textContent = s.title;
      const content = document.createElement("div");
      content.className = "help-body";
      content.innerHTML = s.html;   // duckdown's own pages, rendered by its own renderer
      details.append(summary, content);
      return details;
    }));
  });

  return (
    <Drawer icon="circle-help" title="Help" close="Close help" onclose={closeDrawer}>
      <div class="sidebar-content help" ref={(el: HTMLElement) => { body = el; }} />
    </Drawer>
  );
}
