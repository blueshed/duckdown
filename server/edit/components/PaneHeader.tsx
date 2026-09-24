import { createElement, Fragment, computed, signal, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { ConfirmDialog } from "./ConfirmDialog";
import { VersionsDialog } from "./History";
import { NewDialog } from "./NewDialog";

const NOT_SAVED = "Not saved";

// One header for both panes. The page and the resource beneath it do the same
// things — name what is open, say whether it is unsaved, save it, delete it —
// so they say them the same way, in the same order, from one place.
//
// Delete still asks first, wherever it is, but it is no longer the end of the
// file: the server keeps what a delete removes and what a save replaces, and
// Earlier versions (the clock) puts any of it back. A pane that undoes its own
// changes (the collection's) passes undo and redo, and they sit here too.
type Flag = { get(): boolean };
export function PaneHeader(props: {
  icon: string;
  name: { get(): string };
  dirty: { get(): boolean; peek(): boolean };
  onsave: () => unknown;
  ondelete: () => unknown;
  onclose?: () => void;
  url: () => string;              // the open file's /edit/<section>/ address
  onrestored: () => unknown;      // read it again: a version was put back
  onmove?: (to: string) => Promise<string | void>;   // a page renames; a message when it didn't
  undo?: { onundo: () => unknown; onredo: () => unknown; canUndo: Flag; canRedo: Flag };
}) {
  const flash = signal("");
  const confirming = signal(false);
  const versions = signal(false);
  const moving = signal(false);
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
      {props.undo ? <>
        <button class="icon-btn" aria-label="Undo" title="Undo (⌘Z)"
          disabled={computed(() => !props.undo!.canUndo.get())} onclick={props.undo.onundo}>
          <Icon name="undo" />
        </button>
        <button class="icon-btn" aria-label="Redo" title="Redo (⇧⌘Z)"
          disabled={computed(() => !props.undo!.canRedo.get())} onclick={props.undo.onredo}>
          <Icon name="redo" />
        </button>
      </> : null}
      {props.onmove
        ? <button class="icon-btn" aria-label={`Rename or move ${label()}`} title="Rename or move"
            onclick={() => moving.set(true)}>
            <Icon name="folder-input" />
          </button>
        : null}
      <button class="icon-btn" aria-label={`Earlier versions of ${label()}`} title="Earlier versions"
        onclick={() => versions.set(true)}>
        <Icon name="history" />
      </button>
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
          message="Its last version is kept: Deleted, beside the list it is in, brings it back."
          onconfirm={remove}
          oncancel={() => confirming.set(false)}
        />
      ))}
      {when(moving, () => (
        <NewDialog kind="page" heading={`Rename or move ${label()}`} initial={label()} action="Move"
          oncreate={async (to) => {
            const message = await props.onmove!(to);
            if (!message) moving.set(false);
            return message;
          }}
          oncancel={() => moving.set(false)} />
      ))}
      {when(versions, () => (
        <VersionsDialog url={props.url()} name={label()} onrestored={props.onrestored}
          oncancel={() => versions.set(false)} />
      ))}
    </div>
  );
}
