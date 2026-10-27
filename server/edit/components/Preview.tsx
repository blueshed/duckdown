import { createElement, signal, computed, effect, batch } from "@blueshed/railroad";
import { rendered } from "../api";
import { editorContent, filePath, pageLayout, pageIncludes, resource, resourceDraft, collectionRevision, opening } from "../store";
import { speak, hush, notice } from "../notice";
import { PreviewFrame } from "./PreviewFrame";

// The server renders the whole document, the way the site will: the page's
// markdown inside its template, with the nav, its stylesheets and the rest
// filled in. `layout` says which template it used, and `problems` is anything
// wrong with the folder's collection.json, or a link on the page that leads
// nowhere — said when it changes, not on every keystroke, and taken down once
// it is put right, if it is still what the line says.
type Rendered = { html: string; layout: string; includes: string[]; problems?: string[] };

// How long a render of the page being typed into may take before the
// preview says it is coming. A quick one says nothing, as before; a slow one
// (a save drops what the server keeps, and on a bucket the next render took
// seconds) left the old page standing as if nothing were happening (n207).
export const SLOW = 400;

export function Preview() {
  const page = signal("");
  let said = "";
  // Another page is on its way: from the click in the tree (opening) until
  // the frame has loaded what the server rendered for it. Typing re-renders
  // the same page, and says nothing: a line on every keystroke is noise.
  const arriving = signal(false);
  // A render of the same page that has taken longer than SLOW: on its way too.
  const slow = signal(false);
  const busy = computed(() => opening.get() !== null || arriving.get() || slow.get());
  const arrived = () => batch(() => {
    arriving.set(false);
    slow.set(false);
  });
  let shown = "";
  let asked = 0;

  const update = async (source: string, draft: { name: string; body: string } | undefined) => {
    const mine = ++asked;
    const slowly = setTimeout(() => mine === asked && slow.set(true), SLOW);
    const data = await rendered<Rendered>("render the preview", filePath.peek() || "", { source, draft });
    clearTimeout(slowly);
    if (!data) {
      arrived();
      return;
    }
    // The same document again loads nothing, so there is no load to wait for.
    if (data.html === page.peek()) arrived();
    page.set(data.html);
    pageLayout.set(data.layout);
    pageIncludes.set(data.includes);
    const problems = (data.problems ?? []).join(" ");
    if (problems && problems !== said) speak(problems);
    if (!problems && said && notice.peek() === said) hush();
    said = problems;
  };

  // Debounced preview update — tracks the page's text, which page it is, and
  // an open template's draft, because editing the template changes the page.
  // The cleanup cancels a render still pending when anything changes again, or
  // when the preview goes away, so nothing is rendered after the fact.
  effect(() => {
    const source = editorContent.get();
    filePath.get(); // track file changes too
    collectionRevision.get(); // and a write from the collection pane: {{items}} comes from it
    const open = resource.get();
    // A stylesheet is handled below without a round trip; a template is not,
    // because only the server can put the page through it.
    const draft = open?.section === "templates"
      ? { name: open.path, body: resourceDraft.get() }
      : undefined;
    if (!source) return;
    // A page just opened is rendered at once; the pause is for typing, so a
    // render isn't asked for on every keystroke.
    const path = filePath.peek() || "";
    if (path !== shown) {
      shown = path;
      arriving.set(true);
      update(source, draft);
      return;
    }
    const timer = setTimeout(() => update(source, draft), 300);
    return () => clearTimeout(timer);
  });

  // A stylesheet being edited wins over the saved one, and needs no round trip
  // to the server: the iframe restyles itself as the text changes.
  const draftCss = () => {
    const open = resource.get();
    return open && open.path.endsWith(".css") ? `<style>${resourceDraft.get()}</style>` : "";
  };

  const srcdoc = computed(() => {
    const html = page.get();
    if (!html) return "";
    const css = draftCss();
    if (!css) return html;
    // Last in <head> so it wins, or at the top of a template that has no head.
    return html.includes("</head>") ? html.replace("</head>", `${css}</head>`) : css + html;
  });

  return <PreviewFrame srcdoc={srcdoc} title="Preview of the page" busy={busy} onload={arrived} />;
}
