import { createElement, signal, computed, effect } from "@blueshed/railroad";
import { apiJson } from "../api";
import { editorContent, filePath, pageLayout, pageIncludes, resource, resourceDraft, collectionRevision } from "../store";
import { speak } from "../notice";
import { PreviewFrame } from "./PreviewFrame";

// The server renders the whole document, the way the site will: the page's
// markdown inside its template, with the nav, its stylesheets and the rest
// filled in. `layout` says which template it used, and `problems` is anything
// wrong with the folder's collection.json — nothing a page's text can cause,
// so it is said once and not on every keystroke.
type Rendered = { html: string; layout: string; includes: string[]; problems?: string[] };

export function Preview() {
  const page = signal("");
  let said = "";

  const update = async (source: string, draft: { name: string; body: string } | undefined) => {
    const path = encodeURIComponent(filePath.peek() || "");
    const data = await apiJson<Rendered>("render the preview", `/edit/mark/?path=${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, draft }),
    });
    if (!data) return;
    page.set(data.html);
    pageLayout.set(data.layout);
    pageIncludes.set(data.includes);
    const problems = (data.problems ?? []).join(" ");
    if (problems && problems !== said) speak(problems);
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

  return <PreviewFrame srcdoc={srcdoc} />;
}
