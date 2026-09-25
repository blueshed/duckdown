import { createElement, when, computed, effect, pushDisposeScope } from "@blueshed/railroad";
import { Header } from "./components/Header";
import { Browser } from "./components/Browser";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { CssPreview } from "./components/CssPreview";
import { ResourcePane } from "./components/ResourcePane";
import { CollectionPane } from "./components/CollectionPane";
import { TemplatePreview } from "./components/TemplatePreview";
import { Notice } from "./components/Notice";
import { Drawers, LeftDrawer } from "./components/Drawers";
import { PastList, PastPane, PastPreview } from "./components/Past";
import { past, seen } from "./past";
import { filePath, editorContent, loadFile, resource, resourceDraft, collection, opening, previewShown, togglePreview } from "./store";
import { speak } from "./notice";

// App-lifetime root scope: this app is mounted once and never torn down,
// so when()/list() below need a scope to attach to without warning.
pushDisposeScope();

// Failures speak, even ones nothing caught: they reach the notice, not just the console.
window.addEventListener("error", (e: ErrorEvent) => speak(`Something broke: ${e.message}`));
window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) =>
  speak(`Something broke: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));

// Load from URL ?path= param on startup
const urlPath = new URLSearchParams(window.location.search).get("path");
if (urlPath) loadFile(urlPath);

const hasFile = computed(() => filePath.get() !== null);
const openResourceIsCss = computed(() => resource.get()?.path.endsWith(".css") ?? false);

// What the middle column holds, and what the right one shows for it. The rule
// is one sentence: the column holds whatever editors are open, and the preview
// shows what you would see. A page is previewed as the site renders it; with
// no page open, whatever you are composing with gets a sample page of its own,
// so a stylesheet or a template can be written with nothing else on screen.
const nothingOpen = computed(() => !hasFile.get() && resource.get() === null && collection.get() === null);
const pageIsMarkdown = computed(() => filePath.get()?.endsWith(".md") ?? false);
const pageIsCss = computed(() => filePath.get()?.endsWith(".css") ?? false);
const pageIsNeither = computed(() => hasFile.get() && !pageIsMarkdown.get() && !pageIsCss.get());
const cssAlone = computed(() => !hasFile.get() && openResourceIsCss.get());
const templateAlone = computed(() => !hasFile.get() && resource.get()?.section === "templates");
// A collection with no page open: the works are in the middle, and what they
// look like is the folder's index page — which isn't open to render.
const collectionAlone = computed(() => !hasFile.get() && collection.get() !== null);

const app = document.getElementById("app")!;

// The header, and under it the tray: the three columns are compartments cut
// into it — where you are, what you are changing, what a reader would see.
app.appendChild(<Header />);
const tray = document.createElement("div");
tray.className = "tray";
app.appendChild(tray);
// Where you are: the tree, or — looking at the past — the list of it.
tray.appendChild(when(past, () => <PastList />, () => <Browser />));

// The middle column: the page, and under it whatever resource is open. Each
// closes, and the column gives the room to what is left. Built with when() as
// each is shown, so a pane starts from the state as it is then.
const middle = document.createElement("div");
middle.className = "column-middle";
// A page on its way from the tree: a line across the top, what was there dimmed.
effect(() => middle.setAttribute("aria-busy", String(opening.get() !== null)));
middle.appendChild(when(opening, () => <div class="loading-line" role="progressbar" aria-label="Opening the page" />));
// An earlier version, or a deleted file, in front of the panes — which stay
// as they were, hidden, and come back when you look at now again.
middle.appendChild(when(seen, () => <PastPane />));
middle.appendChild(when(hasFile, () => <Editor />));
middle.appendChild(when(collection, () => <CollectionPane />));
middle.appendChild(when(resource, () => <ResourcePane />));
middle.appendChild(when(nothingOpen, () =>
  <div class="panel panel-editor"><div class="placeholder">select a page or a resource</div></div>));
tray.appendChild(middle);

// The preview column. The branches are mutually exclusive, so at most one of
// them is an element at a time; each is built when it's shown, from the
// content as it is then — an iframe attached in the same moment its srcdoc
// changes can go on showing the old document.
const right = document.createElement("div");
right.className = "column-preview";
right.appendChild(when(seen, () => <PastPreview />));
right.appendChild(when(pageIsMarkdown, () => <Preview />));
right.appendChild(when(pageIsCss, () => <CssPreview css={() => editorContent.get()} />));
right.appendChild(when(cssAlone, () => <CssPreview css={() => resourceDraft.get()} />));
right.appendChild(when(templateAlone, () => <TemplatePreview />));
right.appendChild(when(collectionAlone, () =>
  <div class="panel panel-preview"><div class="placeholder">open the folder's page to see the collection</div></div>));
right.appendChild(when(pageIsNeither, () =>
  <div class="panel panel-preview"><div class="placeholder">no preview for this kind of file</div></div>));
right.appendChild(when(nothingOpen, () =>
  <div class="panel panel-preview"><div class="placeholder">preview</div></div>));
tray.appendChild(right);
// On a phone, the preview over the rest (styles.css); Escape goes back to the page.
effect(() => { tray.classList.toggle("previewing", previewShown.get()); });
effect(() => {
  if (!previewShown.get()) return;
  const back = (e: KeyboardEvent) => { if (e.key === "Escape") togglePreview(); };
  document.addEventListener("keydown", back);
  return () => document.removeEventListener("keydown", back);
});

// The drawers: at the right, over the preview, Resources, Editors or Publish;
// at the left, over the tree, the properties of a work chosen in the middle.
tray.appendChild(<Drawers />);
tray.appendChild(<LeftDrawer />);

// Failures, when there are any (fixed, over everything)
app.appendChild(<Notice />);
