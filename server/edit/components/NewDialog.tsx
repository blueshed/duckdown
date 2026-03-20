import { createElement, signal, when } from "@blueshed/railroad";
import { Icon } from "./Icon";

interface NewDialogProps {
  hasTheme: boolean;
  oncreate: (type: "page" | "folder" | "theme", name: string) => void;
  oncancel: () => void;
}

export function NewDialog({ hasTheme, oncreate, oncancel }: NewDialogProps) {
  let dialogRef: HTMLDialogElement | null = null;
  const selected = signal<"page" | "folder" | null>(null);
  const name = signal("");

  queueMicrotask(() => dialogRef?.showModal());

  const placeholder = () => selected.peek() === "page" ? "my-page.md" : "folder-name";

  return (
    <dialog
      ref={(el: HTMLDialogElement) => { dialogRef = el; }}
      class="dialog"
      onclose={oncancel}
    >
      {when(
        () => selected.get() === null,
        () => (
          <div>
            <h3>Create new</h3>
            <div class="new-options">
              <button onclick={() => selected.set("page")}>
                <Icon name="file-text" /> Page
              </button>
              <button onclick={() => selected.set("folder")}>
                <Icon name="folder-plus" /> Folder
              </button>
              {!hasTheme && (
                <button onclick={() => oncreate("theme", "-theme.css")}>
                  <Icon name="droplet" /> Theme
                </button>
              )}
            </div>
            <div class="dialog-actions">
              <button type="button" onclick={() => { dialogRef?.close(); oncancel(); }}>Cancel</button>
            </div>
          </div>
        ),
        () => (
          <form onsubmit={(e: Event) => {
            e.preventDefault();
            const n = name.peek();
            const s = selected.peek();
            if (n && s) oncreate(s, n);
          }}>
            <h3>New {selected}</h3>
            <input
              type="text"
              placeholder={placeholder()}
              autofocus
              oninput={(e: Event) => name.set((e.target as HTMLInputElement).value)}
            />
            <div class="dialog-actions">
              <button type="button" onclick={() => { selected.set(null); name.set(""); }}>Back</button>
              <button type="submit" class="primary">Create</button>
            </div>
          </form>
        ),
      )}
    </dialog>
  );
}
