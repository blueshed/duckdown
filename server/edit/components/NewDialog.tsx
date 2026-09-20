import { createElement, signal, when } from "@blueshed/railroad";
import { Icon } from "./Icon";

interface NewDialogProps {
  hasTheme: boolean;
  // Resolves to a message when nothing was created (e.g. the name is taken).
  oncreate: (type: "page" | "folder" | "theme", name: string) => Promise<string | void>;
  oncancel: () => void;
}

export function NewDialog({ hasTheme, oncreate, oncancel }: NewDialogProps) {
  let dialogRef: HTMLDialogElement | null = null;
  const selected = signal<"page" | "folder" | null>(null);
  const name = signal("");
  const error = signal("");

  queueMicrotask(() => dialogRef?.showModal());

  const create = async (type: "page" | "folder" | "theme", n: string) => {
    const message = await oncreate(type, n);
    if (message) error.set(message);
  };

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
                <button onclick={() => create("theme", "-theme.css")}>
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
            if (n && s) create(s, n);
          }}>
            <h3>New {selected}</h3>
            <input
              type="text"
              placeholder={placeholder()}
              autofocus
              oninput={(e: Event) => { name.set((e.target as HTMLInputElement).value); error.set(""); }}
            />
            <div class="dialog-actions">
              <button type="button" onclick={() => { selected.set(null); name.set(""); error.set(""); }}>Back</button>
              <button type="submit" class="primary">Create</button>
            </div>
          </form>
        ),
      )}
      {when(error, () => <p class="dialog-error">{error}</p>)}
    </dialog>
  );
}
