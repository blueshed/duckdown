import { createElement, computed, effect, list, signal, when } from "@blueshed/railroad";
import { Icon } from "./Icon";
import { PreviewFrame } from "./PreviewFrame";
import { apiJson } from "../api";
import {
  past, entries, seen, look, lookAtNow, leavePast, restoreSeen, sectionOf, type Entry,
} from "../past";
import { shortName } from "../store";

// The past's three compartments (past.ts): the list where the tree was, the
// one you are looking at where the page was, and it rendered where the
// preview was. Each is shown while there is something to show, and the
// present's own panes wait, hidden, behind them.

const EMPTY = {
  versions: "None yet. The first time a save replaces this file, what it replaced is kept here.",
  deleted: "Nothing has been deleted here.",
};

// The kind of past you are in, which can change without leaving it (the
// clock of another pane): everything that says which is read as it is now.
const kind = () => past.get()?.kind ?? "versions";
const mark = () => when(() => kind() === "versions",
  () => <Icon name="history" size={14} />, () => <Icon name="archive-restore" size={14} />);

export function PastList() {
  const title = computed(() => {
    const p = past.get();
    return p?.kind === "deleted" ? `Deleted from ${p.section}` : "Earlier versions";
  });
  const rows = computed(() => entries.get() ?? []);
  const isSeen = (e: Entry) => computed(() => {
    const s = seen.get();
    return s !== null && s.entry.id === e.id && s.entry.key === e.key;
  });

  return (
    <div class="panel panel-browser panel-past">
      <div class="browser-header">
        {mark()}
        <span class="pane-title">{title}</span>
        <button class="icon-btn" aria-label="Back to the files" title="Back to the files" onclick={leavePast}>
          <Icon name="x" />
        </button>
      </div>
      {when(() => entries.get() === null, () => <p class="past-hint">Looking…</p>)}
      {when(() => entries.get()?.length === 0, () => <p class="past-hint">{() => EMPTY[kind()]}</p>)}
      <ul class="file-list">
        {when(() => kind() === "versions", () => (
          <li>
            <button class="row" aria-current={computed(() => (seen.get() === null ? "true" : null))} onclick={lookAtNow}>
              <span class="row-label">Now</span><span class="row-detail">as it is</span>
            </button>
          </li>
        ))}
        {list(rows, (e) => `${e.key}@${e.id}`, (e$) => (
          <li>
            <button class="row" aria-current={isSeen(e$.peek()).map((on) => (on ? "true" : null))} onclick={() => look(e$.peek())}>
              <span class="row-label">{e$.map((e) => e.label)}</span>
              <span class="row-detail">{e$.map((e) => e.detail)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p class="past-hint past-foot">
        {() => (kind() === "versions"
          ? "A save keeps one version a sitting. Restoring keeps what it replaces, so a restore can be undone too."
          : "Each is kept as it was when it was deleted, with its earlier versions.")}
      </p>
    </div>
  );
}

// The one you are looking at, read-only, its changed lines marked.
export function PastPane() {
  // Read as it is now: the last update before the pane is taken away finds
  // nothing being looked at.
  const entry = () => seen.get()?.entry;
  const lines = computed(() => {
    const now = seen.get();
    if (!now) return [];
    const changed = new Set(now.changed);
    return now.text.split("\n").map((text, n) => ({ n, text, changed: changed.has(n) }));
  });
  const busy = signal(false);
  const restore = async () => {
    busy.set(true);
    await restoreSeen();
    busy.set(false);
  };

  return (
    <div class="past-pane">
      <div class="pane-header">
        {mark()}
        <span class="pane-name">{() => (kind() === "versions" ? shortName(entry()?.key ?? "") : entry()?.key)}</span>
        <span class="pane-when">{() => (kind() === "versions" ? `as it was, ${entry()?.label}` : `deleted ${entry()?.detail}`)}</span>
        <span class="pane-gap" />
        <button class="primary" disabled={busy} onclick={restore}>
          <Icon name="rotate-ccw" /> <span class="label">Restore</span>
        </button>
        <button class="icon-btn" aria-label="Back to now" title="Back to now" onclick={lookAtNow}><Icon name="x" /></button>
      </div>
      <pre class="past-text" tabindex="0" aria-label={computed(() => `${entry()?.key}, read only`)}>
        {list(lines, (l) => l.n, (l$) => (l$.peek().changed
          ? <mark class="line">{l$.map((l) => l.text)}</mark>
          : <span class="line">{l$.map((l) => l.text)}</span>))}
      </pre>
    </div>
  );
}

// A page as it was, rendered the way the site renders it; anything else has
// no page to show, and says so.
export function PastPreview() {
  const html = signal("");
  effect(() => {
    const now = seen.get();
    const p = past.get();
    if (!now || !p) return;
    const section = p.kind === "versions" ? sectionOf(p.url) : p.section;
    if (section !== "pages" || !now.entry.key.endsWith(".md")) return html.set("");
    apiJson<{ html: string }>("render the earlier version", `/edit/mark/?path=${encodeURIComponent(now.entry.key)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: now.text }),
    }).then((data) => { if (data && seen.peek() === now) html.set(data.html); });
  });
  return (
    <div class="past-preview">
      {when(html, () => <PreviewFrame srcdoc={html} title="The page as it was" />,
        () => <div class="panel panel-preview"><div class="placeholder">no preview for this kind of file</div></div>)}
    </div>
  );
}
