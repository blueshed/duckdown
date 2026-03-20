import { createElement } from "@blueshed/railroad";

interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  confirmClass?: string;
  onconfirm: () => void;
  oncancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, confirmClass, onconfirm, oncancel }: ConfirmDialogProps) {
  let dialogRef: HTMLDialogElement | null = null;

  queueMicrotask(() => dialogRef?.showModal());

  return (
    <dialog
      ref={(el: HTMLDialogElement) => { dialogRef = el; }}
      class="dialog"
      onclose={oncancel}
    >
      <h3>{title}</h3>
      {message && <p style="font-size: 13px; color: var(--text-dim); margin-bottom: 16px;">{message}</p>}
      <div class="dialog-actions">
        <button type="button" onclick={() => { dialogRef?.close(); oncancel(); }}>Cancel</button>
        <button class={confirmClass || "danger"} onclick={onconfirm}>{confirmLabel || "Delete"}</button>
      </div>
    </dialog>
  );
}
