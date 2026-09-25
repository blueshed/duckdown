import { createElement, effect } from "@blueshed/railroad";
import { Icon } from "./Icon";

// A drawer in the tray: at the right (store.ts: drawer) Resources, Editors
// or Publish, one at a time, over the preview; at the left (leftDrawer) a
// chosen work's properties, over the tree. It is not a modal — the page
// stays in view and in reach behind it, which is the point of it — so it
// takes focus when it opens, gives it back when it goes, and Escape closes it.
let made = 0;

export function Drawer(props: {
  icon: string;
  title: string | (() => string);
  close: string;                 // the close button's name: "Close resources"
  onclose: () => void;
  side?: "left";                 // over the tree, rather than over the preview
  onkey?: (e: KeyboardEvent) => void; // what its owner answers to from inside it (⌘Z)
  children?: unknown;
}) {
  const opener = document.activeElement as HTMLElement | null;
  const title = `drawer-title-${++made}`;
  let aside: HTMLElement | null = null;
  queueMicrotask(() => aside?.focus());
  // No dependencies: it runs once, and its cleanup when the drawer goes.
  effect(() => () => {
    if (opener?.isConnected) opener.focus();
  });
  return (
    <aside class={props.side === "left" ? "sidebar sidebar-left" : "sidebar"} tabindex="-1" aria-labelledby={title} ref={(el: HTMLElement) => { aside = el; }}
      onkeydown={(e: KeyboardEvent) => {
        props.onkey?.(e);
        if (e.key !== "Escape") return;
        e.preventDefault();
        props.onclose();
      }}>
      <div class="sidebar-header">
        <Icon name={props.icon} size={14} />
        <h3 class="pane-title" id={title}>{props.title}</h3>
        <button class="icon-btn" aria-label={props.close} title={props.close} onclick={props.onclose}>
          <Icon name="x" />
        </button>
      </div>
      {props.children}
    </aside>
  );
}
