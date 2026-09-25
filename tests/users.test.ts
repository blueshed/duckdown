// n113: users.json from the command line, the password prompt, and what a
// session is checked against.
import { describe, test, expect, spyOn } from "bun:test";
import { mkdtempSync, readFileSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { LocalStorage } from "../server/storage";
import {
  askPassword, userCommand, currentUsers, usersChanged, envAdmin, fingerprint, nameProblem, FRESH, usersFrom,
} from "../server/users";
import { cli } from "../server/cli";

// What a terminal, or a pipe, hands over: chunks of text, and whether raw mode was asked for.
function typing(chunks: string[], tty: boolean) {
  const raw: boolean[] = [];
  const input = {
    isTTY: tty,
    setRawMode: (on: boolean) => { raw.push(on); },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; },
  } as unknown as NodeJS.ReadStream;
  let shown = "";
  const output = { write: (text: string) => { shown += text; } };
  return { input, output, raw, shown: () => shown };
}

describe("askPassword", () => {
  test("from a terminal: not echoed, raw mode on and off, and a backspace takes a character back", async () => {
    const t = typing(["sec", "rz\u007f", "et\r", "ignored"], true);
    expect(await askPassword("Password: ", t.input, t.output)).toBe("secret");
    expect(t.raw).toEqual([true, false]);
    expect(t.shown()).toBe("Password: \n");
  });

  test("from a pipe: the first line, or all of it when there's no newline; ctrl-c gives up", async () => {
    const piped = typing(["pass word\nnext line\n"], false);
    expect(await askPassword("? ", piped.input, piped.output)).toBe("pass word");
    expect(piped.raw).toEqual([]);
    expect(await askPassword("? ", typing(["no newline"], false).input, typing([], false).output)).toBe("no newline");
    const quit = typing(["ab\u0003"], true);
    await expect(askPassword("? ", quit.input, quit.output)).rejects.toThrow("cancelled");
    expect(quit.raw).toEqual([true, false]);
  });
});

// A scratch site, and what its users.json says.
const roots = new Map<LocalStorage, string>();
const site = () => {
  const root = mkdtempSync(join(RUN, "users-"));
  const store = new LocalStorage(root);
  roots.set(store, root);
  return store;
};
const file = (store: LocalStorage) => JSON.parse(readFileSync(join(roots.get(store)!, "users.json"), "utf8"));

describe("duckdown user", () => {
  test("adds the first editor to a site with none, changes a password, lists, removes", async () => {
    const store = site();
    const said: string[] = [];
    const say = (line: string) => said.push(line);
    expect(await userCommand(["add", "ann"], async () => "first password", store, say)).toBe(0);
    const first = file(store).ann;
    expect(first).toStartWith("$argon2");
    expect(await userCommand(["passwd", "ann"], async (q) => (q === "Password for ann: " ? "second password" : ""), store, say)).toBe(0);
    expect(file(store).ann).not.toBe(first);
    expect(await Bun.password.verify("second password", file(store).ann)).toBe(true);
    await userCommand(["add", "bea"], async () => "bea's password", store, say);
    expect(await userCommand(["list"], async () => "", store, say)).toBe(0);
    expect(await userCommand(["remove", "bea"], async () => "", store, say)).toBe(0);
    expect(Object.keys(file(store))).toEqual(["ann"]);
    expect(said).toEqual([
      "ann can sign in",
      "ann's password changed: their other sessions have ended",
      "bea can sign in",
      "ann", "bea",
      "bea removed: they can't sign in, and any session they had has ended",
    ]);
  });

  test("a name Object already has is no one until it's added (n118)", async () => {
    const store = site();
    const say = () => {};
    await expect(userCommand(["remove", "constructor"], async () => "", store, say)).rejects.toThrow("No one called constructor can sign in");
    await expect(userCommand(["passwd", "toString"], async () => "long enough", store, say)).rejects.toThrow("No one called toString can sign in");
    expect(await userCommand(["add", "constructor"], async () => "long enough", store, say)).toBe(0);
    expect(Object.keys(file(store))).toContain("constructor");
    expect(usersFrom()["hasOwnProperty"]).toBeUndefined();
    expect(usersFrom(JSON.parse('{"__proto__": "h"}'))["__proto__"]).toBe("h");   // a name, not a prototype
  });

  test("refuses what it can't do, and says why", async () => {
    const store = site();
    const ask = async () => "long enough";
    await userCommand(["add", "ann"], ask, store, () => {});
    await expect(userCommand([], ask, store)).rejects.toThrow("usage: duckdown user list | add <name> | passwd <name> | remove <name>");
    await expect(userCommand(["add"], ask, store)).rejects.toThrow("usage:");
    await expect(userCommand(["add", "ann"], ask, store)).rejects.toThrow("ann can already sign in");
    await expect(userCommand(["remove", "bob"], ask, store)).rejects.toThrow("No one called bob can sign in");
    await expect(userCommand(["add", "a\tb"], ask, store)).rejects.toThrow("A name is one word");
    await expect(userCommand(["add", "bob"], async () => "short", store)).rejects.toThrow("A password is at least 8 characters");
  });

  test("is a duckdown command: `duckdown user list` on this site, and a failure is an exit code", async () => {
    const log = spyOn(console, "log").mockImplementation(() => {});
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await cli(["user", "list"])).toBe(0);
      expect(log.mock.calls.map((c) => c[0])).toContain("admin");
      expect(await cli(["user", "bogus"])).toBe(1);
      expect(error.mock.calls[0]![0]).toStartWith("duckdown user: usage:");
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});

describe("what a session is checked against", () => {
  test("users.json is read again once FRESH has passed, and at once after a write here", async () => {
    const store = site();
    await store.write("users.json", JSON.stringify({ ann: "h1" }));
    usersChanged();
    const t = 1_000_000;
    expect(await currentUsers(store, t)).toEqual({ ann: "h1" });
    await store.write("users.json", JSON.stringify({ bea: "h2" }));      // by hand, behind its back
    expect(await currentUsers(store, t + FRESH - 1)).toEqual({ ann: "h1" });
    expect(await currentUsers(store, t + FRESH)).toEqual({ bea: "h2" });
    usersChanged();
  });

  test("a fingerprint changes with the hash and gives nothing away; names and the environment's admin", () => {
    expect(fingerprint("a")).not.toBe(fingerprint("b"));
    expect(fingerprint("a")).toHaveLength(16);
    expect(nameProblem("ann@example.com")).toBeNull();
    expect(nameProblem(7)).not.toBeNull();
    expect(envAdmin({})).toBeNull();
    expect(envAdmin({ DUCKDOWN_ADMIN_PASSWORD: "x" })).toBe("admin");
    expect(envAdmin({ DUCKDOWN_ADMIN_PASSWORD: "x", DUCKDOWN_ADMIN_USER: "robot" })).toBe("robot");
  });
});
