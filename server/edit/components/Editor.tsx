import { createElement, signal, computed, effect } from "@blueshed/railroad";
import { PaneHeader } from "./PaneHeader";
import { urlPath } from "../api";
import { filePath, editorContent, saveFile, deleteFile, closeFile, loadFile, moveFile } from "../store";

export function Editor() {
  const dirty = signal(false);
  const fp = computed(() => filePath.get() || "");

  const save = async () => {
    if (await saveFile()) dirty.set(false);
  };

  const onkeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (dirty.peek()) save();
    }
  };

  const oninput = (e: Event) => {
    editorContent.set((e.target as HTMLTextAreaElement).value);
    dirty.set(true);
  };

  // A new file starts clean.
  effect(() => {
    filePath.get();
    dirty.set(false);
  });

  return (
    <div class="editor-area">
      <PaneHeader icon="file-text" name={fp} dirty={dirty} onsave={save} ondelete={deleteFile} onclose={closeFile}
        url={() => `/edit/pages/${urlPath(fp.peek())}`} onrestored={() => loadFile(fp.peek())} onmove={moveFile} />
      <textarea aria-label={computed(() => `Contents of ${fp.get()}`)} value={editorContent} onkeydown={onkeydown} oninput={oninput} />
    </div>
  );
}
