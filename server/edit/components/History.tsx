import { createElement, signal, computed, list, when, type ReadonlySignal } from "@blueshed/railroad";
import { api, apiJson, urlPath } from "../api";
import { tell } from "../notice";
import { Icon } from "./Icon";

// Earlier versions, and files that were deleted: the server keeps them
// (history.ts) and these put them back. Restoring is a write like any other,
// and what it replaces is kept first, so it can itself be taken back — which
// is why neither dialog asks "are you sure?".

type Version = { id: string; size: number };
type Deleted = { key: string; id: string };
type Row = { key: string; label: string; detail: string; run: () => Promise<unknown> };

// A version's name is when it was kept: "2026-09-23T10-15-30-123Z", shown the
// way the reader's own clock would say it.
export function whenKept(id: string): string {
  const ms = Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, "T$1:$2:$3.$4Z"));
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const size = (n: number) => (n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KB`);

async function restore(url: string, id: string, what: string): Promise<boolean> {
  const res = await api(`restore ${what}`, `${url}?restore=${encodeURIComponent(id)}`, { method: "POST" });
  if (res.ok) tell(`${what} is back as it was on ${whenKept(id)}. What it replaced is in its earlier versions.`);
  return res.ok;
}

function RestoreDialog(props: { title: string; empty: string; rows: ReadonlySignal<Row[] | null>; oncancel: () => void }) {
  let dialogRef: HTMLDialogElement | null = null;
  const busy = signal(false);
  const rows = computed(() => props.rows.get() ?? []);
  queueMicrotask(() => dialogRef?.showModal());

  const run = async (row: Row) => {
    busy.set(true);
    await row.run();
    busy.set(false);
  };

  return (
    <dialog ref={(el: HTMLDialogElement) => { dialogRef = el; }} class="dialog dialog-history" onclose={props.oncancel}>
      <h3>{props.title}</h3>
      {when(() => props.rows.get() === null, () => <p class="dialog-hint">Looking…</p>)}
      {when(() => props.rows.get()?.length === 0, () => <p class="dialog-hint">{props.empty}</p>)}
      <ul class="history-list">
        {list(rows, (r) => r.key, (row$) => (
          <li>
            <span class="history-label">{row$.map((r) => r.label)}</span>
            <span class="history-detail">{row$.map((r) => r.detail)}</span>
            <button disabled={busy} onclick={() => run(row$.peek())}>
              <Icon name="rotate-ccw" size={12} /> Restore
            </button>
          </li>
        ))}
      </ul>
      <div class="dialog-actions">
        <button type="button" onclick={() => { dialogRef?.close(); props.oncancel(); }}>Close</button>
      </div>
    </dialog>
  );
}

// The versions of one open file, newest first. `url` is its /edit/<section>/
// address; `onrestored` reads it again, since what is on screen is now old.
export function VersionsDialog(props: {
  url: string; name: string; onrestored: () => unknown; oncancel: () => void;
}) {
  const rows = signal<Row[] | null>(null);
  apiJson<Version[]>(`list the earlier versions of ${props.name}`, `${props.url}?versions`).then((versions) =>
    rows.set((versions ?? []).map((v) => ({
      key: v.id,
      label: whenKept(v.id),
      detail: size(v.size),
      run: async () => {
        if (!(await restore(props.url, v.id, props.name))) return;
        props.oncancel();
        await props.onrestored();
      },
    }))));
  return (
    <RestoreDialog title={`Earlier versions of ${props.name}`} rows={rows} oncancel={props.oncancel}
      empty="None yet. The first time a save replaces this file, what it replaced is kept here." />
  );
}

// Files deleted from one section of the site, each with the last version kept.
export function DeletedDialog(props: {
  section: "pages" | "templates" | "static"; onrestored: (key: string) => unknown; oncancel: () => void;
}) {
  const rows = signal<Row[] | null>(null);
  apiJson<Deleted[]>(`list what was deleted from ${props.section}`, `/edit/${props.section}/?deleted`).then((gone) =>
    rows.set((gone ?? []).map((d) => ({
      key: d.key,
      label: d.key,
      detail: whenKept(d.id),
      run: async () => {
        if (!(await restore(`/edit/${props.section}/${urlPath(d.key)}`, d.id, d.key))) return;
        props.oncancel();
        await props.onrestored(d.key);
      },
    }))));
  return (
    <RestoreDialog title={`Deleted from ${props.section}`} rows={rows} oncancel={props.oncancel}
      empty="Nothing has been deleted here." />
  );
}
