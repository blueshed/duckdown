import { effect } from "@blueshed/railroad";

// Every dialog in the editor is a <dialog> shown modally as soon as it is in
// the page, and it goes one of two ways: closed (Escape, Cancel), or taken out
// of the page by the when() that made it, once what it asked for is done. The
// browser puts focus back after the first; after the second it fell to
// <body>, and a keyboard user started again from the top. So either way,
// focus goes back to whatever had it when the dialog opened — if that is
// still in the page.
//
// Call it in the dialog's component: `ref` goes on the <dialog>, `title` is
// the id of its heading, for aria-labelledby, so a screen reader names it.
let made = 0;

export function modal() {
  const opener = document.activeElement as HTMLElement | null;
  const title = `dialog-title-${++made}`;
  let dialog: HTMLDialogElement | null = null;
  queueMicrotask(() => dialog?.showModal());
  // No dependencies: it runs once, and its cleanup when the component goes.
  effect(() => () => {
    if (dialog?.open) dialog.close();       // a modal makes the rest inert: out of it first
    if (opener?.isConnected) opener.focus();
  });
  return {
    title,
    ref: (el: HTMLDialogElement) => { dialog = el; },
    close: () => dialog?.close(),
  };
}
