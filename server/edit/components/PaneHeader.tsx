import { createElement, computed, signal, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { ConfirmDialog } from "./ConfirmDialog";

const NOT_SAVED = "Not saved";

// One header for both panes. The page and the resource beneath it do the same
// things — name what is open, say whether it is unsaved, save it, delete it —
// so they say them the same way, in the same order, from one place.
//
// Delete always asks first, wherever it is: a stylesheet or a template is as
// easy to lose as a page, and there is no undo behind any of them.
export function PaneHeader(props: {
  icon: string;
  name: { get(): string };
  dirty: { get(): boolean; peek(): boolean };
  onsave: () => unknown;
  ondelete: () => unknown;
  onclose?: () => void;
}) {
  const flash = signal("");
  const confirming = signal(false);
  const label = () => props.name.get();

  // A failed save leaves the pane dirty and flashes red; the notice says why.
  const save = async () => {
    await props.onsave();
    flash.set(props.dirty.peek() ? NOT_SAVED : "Saved");
    setTimeout(() => flash.set(""), 1500);
  };

  const remove = async () => {
    confirming.set(false);
    await props.ondelete();
  };

  const saveClass = computed(() =>
    flash.get() === NOT_SAVED ? "danger" : flash.get() ? "saved" : props.dirty.get() ? "primary" : "",
  );

  return (
    <div class="pane-header">
      <Icon name={props.icon} size={13} />
      <span class="pane-name">{label}</span>
      {when(props.dirty as never, () => <span class="dot" title="Unsaved changes">●</span>)}
      <span class="pane-gap" />
      <button class="icon-btn danger-subtle" aria-label={`Delete ${label()}`} title="Delete" onclick={() => confirming.set(true)}>
        <Icon name="trash-2" />
      </button>
      <button class={saveClass} onclick={save}>
        <Icon name="save" /> {() => flash.get() || "Save"} <kbd>⌘⏎</kbd>
      </button>
      {props.onclose
        ? <button class="icon-btn" aria-label="Close" title="Close" onclick={props.onclose}><Icon name="x" /></button>
        : null}
      {when(confirming, () => (
        <ConfirmDialog
          title={`Delete ${label()}?`}
          message="This cannot be undone."
          onconfirm={remove}
          oncancel={() => confirming.set(false)}
        />
      ))}
    </div>
  );
}
