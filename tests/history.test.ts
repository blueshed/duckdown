// Earlier versions: what a save replaced and a delete removed, kept beside the
// site rather than in it.
import { describe, test, expect } from "bun:test";
import { mkdtempSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { History, plainKey, QUIET } from "../server/history";
import { LocalStorage } from "../server/storage";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (body: Uint8Array | null) => (body ? new TextDecoder().decode(body) : null);
const T = Date.parse("2026-09-23T10:00:00.000Z");
const fresh = (keep?: number) => new History(new LocalStorage(mkdtempSync(join(RUN, "history-"))), keep);

describe("History", () => {
  test("keeps a version, names it by when, and reads it back", async () => {
    const h = fresh();
    expect(await h.versions("about.md")).toEqual([]);
    expect(await h.save("about.md", bytes("one"), false, T)).toBe(true);
    const [v] = await h.versions("about.md");
    expect(v).toEqual({ id: "2026-09-23T10-00-00-000Z", size: 3 });
    expect(text(await h.read("about.md", v!.id))).toBe("one");
    // An id that isn't one is nothing, and so is one that was never kept.
    expect(await h.read("about.md", "../../users.json")).toBeNull();
    expect(await h.read("about.md", "2026-01-01T00-00-00-000Z")).toBeNull();
  });

  test("a sitting of saves keeps one version; a forced one is always kept", async () => {
    const h = fresh();
    await h.save("a.md", bytes("before the sitting"), false, T);
    expect(await h.save("a.md", bytes("mid-sitting"), false, T + QUIET - 1)).toBe(false);
    expect(await h.save("a.md", bytes("a delete"), true, T + 1000)).toBe(true);
    expect(await h.save("a.md", bytes("the next sitting"), false, T + 1000 + QUIET)).toBe(true);
    const all = await h.versions("a.md");
    expect(all.length).toBe(3);
    expect(text(await h.read("a.md", all[0]!.id))).toBe("the next sitting");   // newest first
  });

  test("two in one millisecond are both kept, and the oldest go past the limit", async () => {
    const h = fresh(3);
    for (let i = 0; i < 5; i++) await h.save("b.md", bytes(`v${i}`), true, T);
    const all = await h.versions("b.md");
    expect(all.length).toBe(3);
    expect(await Promise.all(all.map(async (v) => text(await h.read("b.md", v.id))))).toEqual(["v4", "v3", "v2"]);
  });

  test("lists what was deleted, at any depth, with its newest version", async () => {
    const h = fresh();
    await h.save("here.md", bytes("x"), true, T);
    await h.save("blog/gone.md", bytes("x"), true, T);
    await h.save("blog/gone.md", bytes("y"), true, T + 5);
    await h.save("gone.md", bytes("x"), true, T);
    const there = new Set(["here.md"]);
    const exists = async (key: string) => there.has(key);
    expect(await h.deleted(exists)).toEqual([
      { key: "blog/gone.md", id: "2026-09-23T10-00-00-005Z" },
      { key: "gone.md", id: "2026-09-23T10-00-00-000Z" },
    ]);
    expect(await h.deleted(exists, "blog")).toEqual([{ key: "blog/gone.md", id: "2026-09-23T10-00-00-005Z" }]);
  });
});

describe("plainKey", () => {
  test("a file's name, never a climb or a gap", () => {
    expect(plainKey("about.md")).toBe(true);
    expect(plainKey("blog/a post.md")).toBe(true);
    for (const bad of ["", "..", "a/../b", "./a", "a//b", "/a"]) expect(plainKey(bad)).toBe(false);
  });
});
