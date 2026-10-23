import { createElement, computed } from "@blueshed/railroad";
import { PaneHeader } from "./PaneHeader";
import { TranslationBar } from "./Translations";
import { urlPath } from "../api";
import { filePath, editorContent, fileDirty, saveFile, deleteFile, closeFile, loadFile, moveFile, shortName } from "../store";

export function Editor() {
  const fp = computed(() => filePath.get() || "");
  const shown = computed(() => shortName(fp.get()));

  const onkeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (fileDirty.peek()) saveFile();
    }
  };

  const oninput = (e: Event) => editorContent.set((e.target as HTMLTextAreaElement).value);

  return (
    <div class="editor-area">
      <PaneHeader icon="file-text" name={fp} shown={shown} dirty={fileDirty} onsave={saveFile} ondelete={deleteFile} onclose={closeFile}
        url={() => `/edit/pages/${urlPath(fp.peek())}`} onrestored={() => loadFile(fp.peek())} onmove={moveFile} />
      <TranslationBar />
      <textarea aria-label={computed(() => `Contents of ${fp.get()}`)} value={editorContent} onkeydown={onkeydown} oninput={oninput} />
    </div>
  );
}
