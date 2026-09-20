import { createElement, Fragment, signal, computed, effect, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { ConfirmDialog } from "./ConfirmDialog";
import { filePath, editorContent, saveFile, deleteFile } from "../store";

const NOT_SAVED = "Not saved";

export function Editor() {
  const dirty = signal(false);
  const flash = signal("");
  const confirming = signal(false);

  const fp = computed(() => filePath.get() || "");

  // A failed save keeps the edit dirty and flashes red; the notice says why.
  const save = async () => {
    const saved = await saveFile();
    if (saved) dirty.set(false);
    flash.set(saved ? "Saved" : NOT_SAVED);
    setTimeout(() => flash.set(""), 1500);
  };

  // A failed delete leaves the file open; the notice says why.
  const remove = async () => {
    confirming.set(false);
    await deleteFile();
  };

  const onkeydown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (dirty.peek()) save();
    }
  };

  const oninput = (e: Event) => {
    const value = (e.target as HTMLTextAreaElement).value;
    editorContent.set(value);
    dirty.set(true);
  };

  // Reset dirty when file changes
  effect(() => {
    filePath.get();
    dirty.set(false);
  });

  const btnClass = computed(() =>
    flash.get() === NOT_SAVED ? "danger" : flash.get() ? "saved" : dirty.get() ? "primary" : ""
  );

  return (
    <div class="editor-area">
      <div class="editor-toolbar">
        <span style="flex:1; font-size: 12px; color: var(--text-dim);">{fp}</span>
        <button class="danger-subtle" aria-label="Delete file" title="Delete file" onclick={() => confirming.set(true)}>
          <Icon name="trash-2" />
        </button>
        <button class={btnClass} onclick={save}>
          <Icon name="save" /> {() => flash.get() || "Save"} <kbd>⌘⏎</kbd>
        </button>
      </div>
      <textarea
        value={editorContent}
        onkeydown={onkeydown}
        oninput={oninput}
      />
      {when(confirming, () => (
        <ConfirmDialog
          title={`Delete ${fp.peek()}?`}
          message="This cannot be undone."
          onconfirm={remove}
          oncancel={() => confirming.set(false)}
        />
      ))}
    </div>
  );
}
