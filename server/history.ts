import type { Storage } from "./storage";

// Earlier versions of the files the editor writes. Before a save replaces a
// file, or a delete removes one, the bytes that were there are kept under
// .history/<section>/<key>/<when> — at the site root, in none of the folders
// the site serves, exports or lists, and through the storage layer, so it is
// the same on disk and in a bucket.
//
// It is the safety net for the person who is not going to use git or a
// bucket's versioning: "I deleted the prints group yesterday" is answered by
// opening Earlier versions, not by a terminal. It is not an undo stack. A
// save only keeps what it replaces when nothing was kept in the last few
// minutes, so a sitting of edits leaves one version — the file as it was
// before the sitting — rather than one per keystroke of the collection pane,
// which writes on every change. A delete and a restore always keep one: those
// are the moments someone might want back.

export const HISTORY_PATH = ".history/";
export const KEEP = 30;                  // versions per file; the oldest go
export const QUIET = 10 * 60 * 1000;     // a save keeps one if none is newer than this

// A version's name is when it was kept, in UTC, sortable as text and legal as a
// file name everywhere (no colons): 2026-09-23T10-15-30-123Z.
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[:.]/g, "-");
const time = (id: string) => Date.parse(id.replace(/T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z$/, "T$1:$2:$3.$4Z"));

export type Version = { id: string; size: number };
export type Deleted = { key: string; id: string };

// A key the history will answer for: a file's name, never a climb out of its
// section into another's (pages/../templates) or out of .history altogether.
export const plainKey = (key: string) =>
  key !== "" && !key.split("/").some((part) => part === "" || part === "." || part === "..");

export class History {
  constructor(private store: Storage, private keep = KEEP, private quiet = QUIET) {}

  // Newest first.
  async versions(key: string): Promise<Version[]> {
    const { files } = await this.store.list(key);
    return files
      .filter((f) => STAMP.test(f.name))
      .map((f) => ({ id: f.name, size: f.size }))
      .sort((a, b) => b.id.localeCompare(a.id));
  }

  async read(key: string, id: string): Promise<Uint8Array | null> {
    if (!STAMP.test(id) || !(await this.store.exists(`${key}/${id}`))) return null;
    return this.store.readBytes(`${key}/${id}`);
  }

  // Keep `body` as a version of `key`, unless one was kept a moment ago and
  // this isn't a moment that must be kept (`force`). Then the oldest go.
  async save(key: string, body: Uint8Array, force = false, now = Date.now()): Promise<boolean> {
    const had = await this.versions(key);
    if (!force && had[0] && now - time(had[0].id) < this.quiet) return false;
    // Always after the newest, so it sorts as the newest: two in one
    // millisecond, or a clock that has stepped back, never lands among the old.
    const at = had[0] ? Math.max(now, time(had[0].id) + 1) : now;
    await this.store.write(`${key}/${stamp(at)}`, body);
    for (const old of had.slice(this.keep - 1)) await this.store.remove(`${key}/${old.id}`);
    return true;
  }

  // A file's versions follow it to its new name, among any that name already
  // had (a file deleted from there once), and the newest `keep` stay.
  async move(from: string, to: string): Promise<void> {
    for (const { id } of await this.versions(from)) {
      await this.store.write(`${to}/${id}`, await this.store.readBytes(`${from}/${id}`));
      await this.store.remove(`${from}/${id}`);
    }
    for (const old of (await this.versions(to)).slice(this.keep)) await this.store.remove(`${to}/${old.id}`);
  }

  // Every file under `prefix` that has versions but is no longer there, with
  // its newest version: what a Deleted list offers back.
  async deleted(exists: (key: string) => Promise<boolean>, prefix = ""): Promise<Deleted[]> {
    const { files, folders } = await this.store.list(prefix);
    const out: Deleted[] = [];
    const kept = files.filter((f) => STAMP.test(f.name)).map((f) => f.name).sort();
    if (prefix && kept.length && !(await exists(prefix))) out.push({ key: prefix, id: kept.at(-1)! });
    for (const folder of folders.sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(...await this.deleted(exists, folder.path.replace(/^\//, "")));
    }
    return out;
  }
}
