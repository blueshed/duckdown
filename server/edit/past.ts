import { signal, batch, computed } from "@blueshed/railroad";
import { api, apiJson, urlPath } from "./api";
import { tell } from "./notice";

// The past, as a place you go to rather than a dialog over the present: a
// file's earlier versions, or what was deleted from a section. The server
// keeps both (history.ts). While you are there, the tree's compartment lists
// them, the trail says which you are looking at, the middle shows that one as
// it was — the lines that differ from now marked — and the preview renders
// it. So a version is seen before it is brought back, and bringing it back is
// one press: what it replaces is kept first, so a restore is itself something
// Earlier versions can undo, which is why nothing here asks "are you sure?".
// Nothing about the present is taken apart while you look: the panes stay as
// they were (unsaved words and all) and come back when you leave.

export type Section = "pages" | "templates" | "static";

export type Past =
  | { kind: "versions"; url: string; name: string; onrestored: () => unknown }
  | { kind: "deleted"; section: Section; onrestored: (key: string) => unknown };

// A row in the list: a version of the one file (its key is the file's), or
// a file that was deleted (with the id of the last version kept of it).
export type Entry = { id: string; key: string; label: string; detail: string };

// The one being looked at: its words, and which of its lines aren't in the
// file as it is now (0-based).
export type Seen = { entry: Entry; text: string; changed: number[] };

export const past = signal<Past | null>(null);
export const entries = signal<Entry[] | null>(null);   // null while it is asked for
export const seen = signal<Seen | null>(null);

// The section a file's address is in: /edit/<section>/<key>.
export const sectionOf = (url: string) => url.split("/")[2] as Section;

// Where the one being looked at lives, and what it is called.
const addressOf = (p: Past, entry: Entry) =>
  p.kind === "versions" ? p.url : `/edit/${p.section}/${urlPath(entry.key)}`;
const nameOf = (p: Past, entry: Entry) => (p.kind === "versions" ? p.name : entry.key);

// What the preview can render: a page. Anything else is shown as its words.
export const seenIsPage = computed(() => {
  const p = past.get();
  const s = seen.get();
  if (!p || !s) return false;
  return (p.kind === "versions" ? sectionOf(p.url) : p.section) === "pages" && s.entry.key.endsWith(".md");
});

// A version's name is when it was kept: "2026-09-23T10-15-30-123Z", shown the
// way the reader's own clock would say it.
export function whenKept(id: string): string {
  const ms = Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, "T$1:$2:$3.$4Z"));
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const size = (n: number) => (n < 1024 ? `${n} bytes` : `${(n / 1024).toFixed(1)} KB`);

function enter(to: Past): void {
  batch(() => {
    past.set(to);
    entries.set(null);
    seen.set(null);
  });
}

// A file's versions, newest first; the newest is shown straight away, since
// it is the one you most likely came for.
export async function openVersions(url: string, name: string, onrestored: () => unknown): Promise<void> {
  const here: Past = { kind: "versions", url, name, onrestored };
  enter(here);
  const versions = await apiJson<{ id: string; size: number }[]>(`list the earlier versions of ${name}`, `${url}?versions`);
  if (past.peek() !== here) return;
  const rows = (versions ?? []).map((v) => ({ id: v.id, key: name, label: whenKept(v.id), detail: size(v.size) }));
  entries.set(rows);
  if (rows[0]) await look(rows[0]);
}

// What was deleted from one section, each with the last version kept of it.
export async function openDeleted(section: Section, onrestored: (key: string) => unknown): Promise<void> {
  const here: Past = { kind: "deleted", section, onrestored };
  enter(here);
  const gone = await apiJson<{ key: string; id: string }[]>(`list what was deleted from ${section}`, `/edit/${section}/?deleted`);
  if (past.peek() !== here) return;
  const rows = (gone ?? []).map((d) => ({ id: d.id, key: d.key, label: d.key, detail: whenKept(d.id) }));
  entries.set(rows);
  if (rows[0]) await look(rows[0]);
}

export async function look(entry: Entry): Promise<boolean> {
  const p = past.peek();
  if (!p) return false;
  const url = addressOf(p, entry);
  const res = await api(`read ${nameOf(p, entry)} as it was on ${whenKept(entry.id)}`,
    `${url}?version=${encodeURIComponent(entry.id)}`);
  if (!res.ok || past.peek() !== p) return false;
  const text = await res.text();
  // Against the file as it is now; a deleted one has no now to differ from.
  let changed: number[] = [];
  if (p.kind === "versions") {
    const now = await api(`read ${p.name}`, url);
    if (now.ok) changed = changedLines(text, await now.text());
  }
  if (past.peek() !== p) return false;
  seen.set({ entry, text, changed });
  return true;
}

// Back to the file as it is, still in the past's place.
export function lookAtNow(): void {
  seen.set(null);
}

export function leavePast(): void {
  batch(() => {
    past.set(null);
    entries.set(null);
    seen.set(null);
  });
}

export async function restoreSeen(): Promise<boolean> {
  const p = past.peek();
  const s = seen.peek();
  if (!p || !s) return false;
  const what = nameOf(p, s.entry);
  const res = await api(`restore ${what}`, `${addressOf(p, s.entry)}?restore=${encodeURIComponent(s.entry.id)}`, { method: "POST" });
  if (!res.ok) return false;
  tell(`${what} is back as it was on ${whenKept(s.entry.id)}. What it replaced is in its earlier versions.`);
  leavePast();
  await (p.kind === "versions" ? p.onrestored() : p.onrestored(s.entry.key));
  return true;
}

// The lines of `then` that aren't in `now`, by the longest common run of
// lines between them. A pair too big to compare cheaply marks nothing rather
// than keep the editor waiting: the words are still there to read.
export const COMPARE_LIMIT = 4_000_000;

export function changedLines(then: string, now: string): number[] {
  const a = then.split("\n");
  const b = now.split("\n");
  if (a.length * b.length > COMPARE_LIMIT) return [];
  const width = b.length + 1;
  const common = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i * width + j] = a[i] === b[j]
        ? common[(i + 1) * width + j + 1]! + 1
        : Math.max(common[(i + 1) * width + j]!, common[i * width + j + 1]!);
    }
  }
  const changed: number[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length) {
    if (j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j < b.length && common[i * width + j + 1]! >= common[(i + 1) * width + j]!) j++;
    else changed.push(i++);
  }
  return changed;
}
