import { createElement, effect, when, computed } from "@blueshed/railroad";
import { Header } from "./components/Header";
import { Browser } from "./components/Browser";
import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { CssPreview } from "./components/CssPreview";
import { ImageBrowser } from "./components/ImageBrowser";
import { filePath, showImages, loadFile } from "./store";

// Load from URL ?path= param on startup
const urlPath = new URLSearchParams(window.location.search).get("path");
if (urlPath) loadFile(urlPath);

const hasFile = computed(() => filePath.get() !== null);
const isCss = computed(() => filePath.get()?.endsWith(".css") ?? false);

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

// Preview panel — placeholder, markdown preview, or CSS preview
const previewPlaceholder = <div class="panel panel-preview"><div class="placeholder">preview</div></div>;
const preview = <Preview />;
const cssPreview = <CssPreview />;
const previewAnchor = document.createComment("preview");
app.appendChild(previewAnchor);

let currentPreview: Node | null = null;

effect(() => {
  const fp = filePath.get();
  const css = isCss.get();

  const next = !fp ? previewPlaceholder : css ? cssPreview : preview;

  if (next !== currentPreview) {
    if (currentPreview && currentPreview.parentNode) {
      currentPreview.parentNode.removeChild(currentPreview);
    }
    previewAnchor.parentNode?.insertBefore(next, previewAnchor.nextSibling);
    currentPreview = next;
  }
});

// Image browser sidebar
app.appendChild(
  when(showImages, () => <ImageBrowser />)
);
