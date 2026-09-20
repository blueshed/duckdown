import { createElement, effect, when, computed, pushDisposeScope } from "@blueshed/railroad";
import { Header } from "./components/Header";
import { Browser } from "./components/Browser";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { CssPreview } from "./components/CssPreview";
import { ImageBrowser } from "./components/ImageBrowser";
import { Notice } from "./components/Notice";
import { filePath, showImages, loadFile } from "./store";
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
const isCss = computed(() => filePath.get()?.endsWith(".css") ?? false);
const isMarkdown = computed(() => filePath.get()?.endsWith(".md") ?? false);

const app = document.getElementById("app")!;

// Header and Browser — always present
app.appendChild(<Header />);
app.appendChild(<Browser />);

// Editor panel — placeholder or editor
const editorPanel = <div class="panel panel-editor" /> as HTMLElement;
const editorPlaceholder = <div class="placeholder">select a file</div>;
const editor = <Editor />;
editorPanel.appendChild(editorPlaceholder);

effect(() => {
  if (hasFile.get()) {
    editorPanel.replaceChildren(editor);
  } else {
    editorPanel.replaceChildren(editorPlaceholder);
  }
});
app.appendChild(editorPanel);

// Preview panel — placeholder, markdown preview, or CSS preview. Each is built
// when it's shown, from the content as it is then: an iframe attached in the
// same moment its srcdoc changes can go on showing the old document.
app.appendChild(
  when(
    hasFile,
    // Markdown gets the rendered preview and CSS gets the sample page. A
    // template is neither: running site.html through the markdown renderer
    // showed a soup of its own placeholders, which helped nobody.
    () => when(isCss, () => <CssPreview />,
      () => when(isMarkdown, () => <Preview />,
        () => <div class="panel panel-preview"><div class="placeholder">no preview for this kind of file</div></div>)),
    () => <div class="panel panel-preview"><div class="placeholder">preview</div></div>,
  ),
);

// Image browser sidebar
app.appendChild(
  when(showImages, () => <ImageBrowser />)
);

// Failures, when there are any (fixed, over everything)
app.appendChild(<Notice />);
