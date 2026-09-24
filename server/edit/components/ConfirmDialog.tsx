import { createElement } from "@blueshed/railroad";
import { modal } from "../modal";

interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  confirmClass?: string;
  onconfirm: () => void;
  oncancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, confirmClass, onconfirm, oncancel }: ConfirmDialogProps) {
  const dialog = modal();

  return (
    <dialog ref={dialog.ref} class="dialog" aria-labelledby={dialog.title} onclose={oncancel}>
      <h3 id={dialog.title}>{title}</h3>
      {message && <p style="font-size: 13px; color: var(--text-dim); margin-bottom: 16px;">{message}</p>}
      <div class="dialog-actions">
        <button type="button" onclick={() => { dialog.close(); oncancel(); }}>Cancel</button>
        <button class={confirmClass || "danger"} onclick={onconfirm}>{confirmLabel || "Delete"}</button>
      </div>
    </dialog>
  );
}
