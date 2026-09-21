import { createElement, when, computed, pushDisposeScope } from "@blueshed/railroad";
import { Header } from "./components/Header";
import { Browser } from "./components/Browser";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { CssPreview } from "./components/CssPreview";
import { ImageBrowser } from "./components/ImageBrowser";
import { ResourcePane } from "./components/ResourcePane";
import { TemplatePreview } from "./components/TemplatePreview";
import { Notice } from "./components/Notice";
import { filePath, editorContent, showImages, loadFile, resource, resourceDraft } from "./store";
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
const nothingOpen = computed(() => !hasFile.get() && resource.get() === null);
const pageIsMarkdown = computed(() => filePath.get()?.endsWith(".md") ?? false);
const pageIsCss = computed(() => filePath.get()?.endsWith(".css") ?? false);
const pageIsNeither = computed(() => hasFile.get() && !pageIsMarkdown.get() && !pageIsCss.get());
const cssAlone = computed(() => !hasFile.get() && openResourceIsCss.get());
const templateAlone = computed(() => !hasFile.get() && resource.get()?.section === "templates");

const app = document.getElementById("app")!;

// Header and Browser — always present
app.appendChild(<Header />);
app.appendChild(<Browser />);

// The middle column: the page, and under it whatever resource is open. Each
// closes, and the column gives the room to what is left. Built with when() as
// each is shown, so a pane starts from the state as it is then.
const middle = document.createElement("div");
middle.className = "column-middle";
middle.appendChild(when(hasFile, () => <Editor />));
middle.appendChild(when(resource, () => <ResourcePane />));
middle.appendChild(when(nothingOpen, () =>
  <div class="panel panel-editor"><div class="placeholder">select a page or a resource</div></div>));
app.appendChild(middle);

// The preview column. The branches are mutually exclusive, so at most one of
// them is an element at a time; each is built when it's shown, from the
// content as it is then — an iframe attached in the same moment its srcdoc
// changes can go on showing the old document.
const right = document.createElement("div");
right.className = "column-preview";
right.appendChild(when(pageIsMarkdown, () => <Preview />));
right.appendChild(when(pageIsCss, () => <CssPreview css={() => editorContent.get()} />));
right.appendChild(when(cssAlone, () => <CssPreview css={() => resourceDraft.get()} />));
right.appendChild(when(templateAlone, () => <TemplatePreview />));
right.appendChild(when(pageIsNeither, () =>
  <div class="panel panel-preview"><div class="placeholder">no preview for this kind of file</div></div>));
right.appendChild(when(nothingOpen, () =>
  <div class="panel panel-preview"><div class="placeholder">preview</div></div>));
app.appendChild(right);

// Resources sidebar
app.appendChild(
  when(showImages, () => <ImageBrowser />)
);

// Failures, when there are any (fixed, over everything)
app.appendChild(<Notice />);
