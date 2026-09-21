import { createElement, signal, when } from "@blueshed/railroad";

export type NewKind = "page" | "folder" | "stylesheet" | "template";

const PLACEHOLDER: Record<NewKind, string> = {
  page: "my-page.md",
  folder: "folder-name",
  stylesheet: "poster.css",
  template: "post.html",
};

interface NewDialogProps {
  kind: NewKind;
  // Resolves to a message when nothing was created (e.g. the name is taken).
  oncreate: (name: string) => Promise<string | void>;
  oncancel: () => void;
}

// One question: what is it called. Which kind was settled by the button you
// pressed, so there is nothing to pick here — a dialog that first asked you to
// choose page or folder was a step between you and the only thing you came to
// type.
export function NewDialog({ kind, oncreate, oncancel }: NewDialogProps) {
  let dialogRef: HTMLDialogElement | null = null;
  const name = signal("");
  const error = signal("");

  queueMicrotask(() => dialogRef?.showModal());

  const create = async () => {
    const n = name.peek();
    if (!n) return;
    const message = await oncreate(n);
    if (message) error.set(message);
  };

  return (
    <dialog
      ref={(el: HTMLDialogElement) => { dialogRef = el; }}
      class="dialog"
      onclose={oncancel}
    >
      <form onsubmit={(e: Event) => { e.preventDefault(); create(); }}>
        <h3>New {kind}</h3>
        <input
          type="text"
          placeholder={PLACEHOLDER[kind]}
          autofocus
          oninput={(e: Event) => { name.set((e.target as HTMLInputElement).value); error.set(""); }}
        />
        <div class="dialog-actions">
          <button type="button" onclick={() => { dialogRef?.close(); oncancel(); }}>Cancel</button>
          <button type="submit" class="primary">Create</button>
        </div>
      </form>
      {when(error, () => <p class="dialog-error">{error}</p>)}
    </dialog>
  );
}
