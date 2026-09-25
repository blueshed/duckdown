// duckdown upgrade, against a site in a scratch folder. git, bun install and
// the export are stood in for: install puts whatever version the pin names
// into node_modules, and the export writes what that version would.
import { describe, test, expect, spyOn } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { cli } from "../server/cli";
import { upgradeCommand, spawnRun, newer, latestTag, changesBetween, compare, type Run } from "../server/upgrade";

const CHANGELOG = [
  "# Changelog", "",
  "## 0.12.3 — 2026-09-26", "", "- Sharing cards.", "",
  "## 0.12.2 — 2026-09-25", "", "- The tidy.", "",
  "## 0.12.1 — 2026-09-25", "", "- The phone preview.", "",
].join("\n");

// A site pinned to `version`, with that duckdown installed.
function site(version: string, o: { skill?: boolean; dependency?: string | null; dev?: boolean } = {}): string {
  const root = mkdtempSync(join(RUN, "upgrade-"));
  const deps = o.dependency === null ? {} : { duckdown: o.dependency ?? `github:blueshed/duckdown#v${version}` };
  const pkg = o.dev ? { name: "a-site", devDependencies: deps } : { name: "a-site", dependencies: deps };
  writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSync(join(root, "bun.lock"), `lock for ${version}\n`);
  install(root);
  if (o.skill) {
    mkdirSync(join(root, ".claude", "skills", "duckdown"), { recursive: true });
    writeFileSync(join(root, ".claude", "skills", "duckdown", "SKILL.md"), "old skill");
  }
  return root;
}

// What bun install does, for these tests: the pinned version, its changelog and skill.
function install(root: string): void {
  const json = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const pinned = json.dependencies?.duckdown ?? json.devDependencies?.duckdown ?? "";
  const version = pinned.split("#v")[1] ?? "0.0.0";
  const pkg = join(root, "node_modules", "duckdown");
  mkdirSync(join(pkg, ".claude", "skills", "duckdown"), { recursive: true });
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ version }));
  writeFileSync(join(pkg, "CHANGELOG.md"), CHANGELOG);
  writeFileSync(join(pkg, ".claude", "skills", "duckdown", "SKILL.md"), `skill for ${version}`);
  writeFileSync(join(root, "bun.lock"), `lock for ${version}\n`);
}

const installedAt = (root: string) =>
  JSON.parse(readFileSync(join(root, "node_modules", "duckdown", "package.json"), "utf8")).version as string;

// The stand-in runner. `exports` says what each version writes (or that it fails).
function runner(o: {
  tags?: string; tagsFail?: boolean; installFails?: string;
  exports?: Record<string, Record<string, string> | "fail">;
} = {}) {
  const ran: string[] = [];
  const run: Run = async (cmd, cwd) => {
    ran.push(cmd.slice(0, 2).join(" "));
    if (cmd[0] === "git") return o.tagsFail ? { code: 128, out: "fatal: unable to access\n" } : { code: 0, out: o.tags ?? "" };
    if (cmd[1] === "install") {
      const json = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
      const wanted = (json.dependencies ?? json.devDependencies).duckdown.split("#v")[1];
      if (wanted === o.installFails) return { code: 1, out: `error: no tag v${wanted}\n` };
      install(cwd);
      return { code: 0, out: "installed\n" };
    }
    const version = installedAt(cwd);
    const writes = o.exports?.[version] ?? { "index.html": "home" };
    if (writes === "fail") return { code: 1, out: `v${version}: No pages to export\n` };
    const out = cmd[3]!;
    for (const [path, body] of Object.entries(writes)) {
      mkdirSync(join(out, path, ".."), { recursive: true });
      writeFileSync(join(out, path), body);
    }
    return { code: 0, out: "written\n" };
  };
  return { run, ran };
}

const quietly = () => {
  const said: string[] = [];
  return { said, say: (line: string) => said.push(line) };
};

describe("duckdown upgrade", () => {
  test("moves the pin to the newest tag, refreshes the skill, and compares the export", async () => {
    const root = site("0.12.1", { skill: true });
    const { run, ran } = runner({
      tags: "abc\trefs/tags/v0.9.0\ndef\trefs/tags/v0.12.3\n012\trefs/tags/v0.12.10-rc\n345\trefs/tags/v0.12.2\n",
      exports: {
        "0.12.1": { "index.html": "home", "old.html": "gone soon", "blog/post.html": "v1" },
        "0.12.3": { "index.html": "home", "blog/post.html": "v3", "card.png": "new" },
      },
    });
    const { said, say } = quietly();
    expect(await upgradeCommand([], { cwd: root, run, say })).toBe(0);
    expect(ran).toEqual(["git ls-remote", "bun run", "bun install", "bun run"]);
    expect(readFileSync(join(root, "package.json"), "utf8")).toContain('"duckdown": "github:blueshed/duckdown#v0.12.3"');
    expect(readFileSync(join(root, ".claude", "skills", "duckdown", "SKILL.md"), "utf8")).toBe("skill for 0.12.3");
    const text = said.join("\n");
    expect(said[0]).toBe("duckdown v0.12.1 → v0.12.3, and the skill's copy refreshed.");
    expect(said[1]).toBe("The export: 1 file(s) the same, 3 not.");
    expect(text).toContain("  added: card.png");
    expect(text).toContain("  gone: old.html");
    expect(text).toContain("  changed: blog/post.html");
    // What the changelog says came in between: after 0.12.1, up to 0.12.3.
    expect(text).toContain("## 0.12.3");
    expect(text).toContain("## 0.12.2");
    expect(text).not.toContain("## 0.12.1");
    expect(said.at(-1)).toBe("Nothing is committed: look it over, then commit package.json and bun.lock and .claude/skills/duckdown.");
  });

  test("goes to a tag named, with or without its v, and says when the export is the same", async () => {
    const root = site("0.12.1");
    const { run, ran } = runner();
    const { said, say } = quietly();
    expect(await upgradeCommand(["v0.12.2"], { cwd: root, run, say })).toBe(0);
    expect(ran).not.toContain("git ls-remote");
    expect(installedAt(root)).toBe("0.12.2");
    expect(said.slice(0, 2)).toEqual(["duckdown v0.12.1 → v0.12.2.", "The export: all 1 file(s) the same."]);
    expect(said.at(-1)).toBe("Nothing is committed: look it over, then commit package.json and bun.lock.");
    expect(await upgradeCommand(["0.12.2"], { cwd: root, run, say })).toBe(0);
    expect(said.at(-1)).toBe("Already on v0.12.2.");
  });

  test("finds duckdown among the devDependencies too, as init does", async () => {
    const root = site("0.12.1", { dev: true });
    const { run } = runner();
    expect(await upgradeCommand(["0.12.2"], { cwd: root, run, say: () => {} })).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).devDependencies.duckdown).toBe("github:blueshed/duckdown#v0.12.2");
  });

  test("a version that can't install, or can't export the site, is put back", async () => {
    const root = site("0.12.1");
    const before = readFileSync(join(root, "package.json"), "utf8");
    const { run } = runner({ installFails: "0.99.0", exports: { "0.12.3": "fail" } });
    await expect(upgradeCommand(["0.99.0"], { cwd: root, run, say: () => {} }))
      .rejects.toThrow("v0.99.0 didn't install:\nerror: no tag v0.99.0 — put back to v0.12.1");
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
    expect(installedAt(root)).toBe("0.12.1");
    await expect(upgradeCommand(["0.12.3"], { cwd: root, run, say: () => {} }))
      .rejects.toThrow("v0.12.3 can't export this site:\nv0.12.3: No pages to export — put back to v0.12.1");
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(before);
    expect(readFileSync(join(root, "bun.lock"), "utf8")).toBe("lock for 0.12.1\n");
  });

  test("says why it can't start", async () => {
    const { run } = runner({ exports: { "0.12.1": "fail" } });
    const at = (cwd: string, args: string[] = ["0.12.3"], r = run) => upgradeCommand(args, { cwd, run: r, say: () => {} });
    await expect(at(mkdtempSync(join(RUN, "upgrade-none-")))).rejects.toThrow("there is no package.json here");
    await expect(at(site("0.12.1", { dependency: null }))).rejects.toThrow("duckdown isn't a dependency here");
    await expect(at(site("0.12.1", { dependency: "^0.12.1" }))).rejects.toThrow('duckdown is "^0.12.1" here');
    await expect(at(site("0.12.1"), ["latest"])).rejects.toThrow('"latest" isn\'t a version');
    await expect(at(site("0.12.1"))).rejects.toThrow("the site doesn't export as it is, on v0.12.1");
    await expect(at(site("0.12.1"), [], runner({ tagsFail: true }).run)).rejects.toThrow("couldn't read duckdown's tags: fatal: unable to access");
    await expect(at(site("0.12.1"), [], runner({ tags: "" }).run)).rejects.toThrow("couldn't read duckdown's tags: none found");
  });

  test("with no changelog to read, it says nothing of one", async () => {
    const root = site("0.12.1");
    const { run } = runner();
    const wrapped: Run = async (cmd, cwd) => {
      const done = await run(cmd, cwd);
      if (cmd[1] === "install") Bun.spawnSync(["rm", join(cwd, "node_modules", "duckdown", "CHANGELOG.md")]);
      return done;
    };
    const { said, say } = quietly();
    expect(await upgradeCommand(["0.12.3"], { cwd: root, run: wrapped, say })).toBe(0);
    expect(said.join("\n")).not.toContain("##");
  });
});

describe("duckdown upgrade, from the command line", () => {
  test("is a duckdown command, and here — duckdown's own folder — says why it can't", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await cli(["upgrade", "0.12.3"])).toBe(1);
      expect(error.mock.calls[0]![0]).toStartWith("duckdown upgrade: duckdown isn't a dependency here");
    } finally {
      error.mockRestore();
    }
  });
});

describe("its parts", () => {
  test("versions compare as numbers", () => {
    expect(newer("0.12.10", "0.12.9")).toBe(true);
    expect(newer("0.12.9", "0.12.10")).toBe(false);
    expect(newer("1.0.0", "0.99.99")).toBe(true);
    expect(newer("0.12.2", "0.12.2")).toBe(false);
    expect(latestTag("x\trefs/tags/v0.2.0\ny\trefs/tags/v0.10.0\nz\trefs/tags/v0.9.9\n")).toBe("0.10.0");
    expect(latestTag("")).toBeNull();
  });

  test("the changelog between two versions, and nothing outside them", () => {
    expect(changesBetween(CHANGELOG, "0.12.2", "0.12.3")).toBe("## 0.12.3 — 2026-09-26\n\n- Sharing cards.");
    expect(changesBetween(CHANGELOG, "0.12.3", "0.12.1")).toBe("");   // going back: nothing came in
  });

  test("compare sees what was added, what went, what changed", () => {
    const [a, b] = [mkdtempSync(join(RUN, "cmp-a-")), mkdtempSync(join(RUN, "cmp-b-"))];
    for (const [dir, files] of [[a, { "x": "1", "d/y": "2", "gone": "3" }], [b, { "x": "1", "d/y": "two", "new": "4" }]] as const) {
      for (const [path, body] of Object.entries(files)) {
        mkdirSync(join(dir, path, ".."), { recursive: true });
        writeFileSync(join(dir, path), body);
      }
    }
    expect(compare(a, b)).toEqual({ same: 1, added: ["new"], removed: ["gone"], changed: ["d/y"] });
  });

  test("spawnRun runs a command where it's told and hands back what it said", async () => {
    const { code, out } = await spawnRun(["bun", "-e", "console.log(process.cwd()); console.error('and this')"], RUN);
    expect(code).toBe(0);
    expect(out).toContain(RUN.split("/").pop()!);
    expect(out).toContain("and this");
    expect(existsSync(RUN)).toBe(true);
  });
});
