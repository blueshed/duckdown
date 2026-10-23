// The two ways in, and the one scaffold behind them. create/setup.ts deletes
// things, so it only ever runs here on a scratch copy of the repo's shape,
// never on the repo itself.
import { describe, test, expect, spyOn, beforeAll, afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync, symlinkSync, readdirSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { setup } from "../create/setup";
import { cli } from "../server/cli";
import { commitAll, createCommand } from "../server/create";
import { gitEnv } from "../server/gitenv";
import { scripts } from "../server/init";
import type { Run } from "../server/upgrade";

const repo = join(import.meta.dir, "..");
const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
const json = (root: string, path: string) => JSON.parse(read(root, path));
const quiet = () => spyOn(console, "log").mockImplementation(() => {});
const said = (log: ReturnType<typeof quiet>) => log.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
function sh(cwd: string, ...args: string[]): string {
  const ran = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv() });
  if (ran.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${ran.stderr.toString()}`);
  return ran.stdout.toString();
}

// What `bun run export` does in a scaffolded site, as a real process: duckdown's
// code is reached the way the site's own scripts reach it.
function exportIn(root: string) {
  const env = { ...process.env } as Record<string, string | undefined>;
  for (const key of ["DUCKDOWN_PATH", "DUCKDOWN_PID", "DUCKDOWN_SEED", "DUCKDOWN_BUCKET", "DUCKDOWN_ORIGIN"]) delete env[key];
  const done = Bun.spawnSync(["bun", "run", "export"], { cwd: root, env: env as Record<string, string>, stdout: "pipe", stderr: "pipe" });
  expect(done.stderr.toString()).not.toContain("error");   // bun run echoes the command there
  expect(done.exitCode).toBe(0);
  expect(read(root, "dist/index.html")).toContain("Welcome to");
  expect(read(root, "dist/static/site.css")).toContain("--accent");   // the base, from duckdown
  expect(existsSync(join(root, "dist", "static", "search.js"))).toBe(true);
  expect(existsSync(join(root, "dist", "search", "index.json"))).toBe(true);   // the index, in parts
  expect(existsSync(join(root, "dist", "search", "pages", "0.json"))).toBe(true);
}

// A clone of duckdown as bun create leaves it (server/ is the real one, so the
// site can run).
function clone(root: string) {
  for (const dir of [".claude/skills/duckdown", ".claude/skills/railroad", ".claude/skills/bun-route", "create", "tests/example"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  symlinkSync(join(repo, "server"), join(root, "server"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "duckdown", version: "0.2.0", description: "A markdown CMS", bin: { duckdown: "./server/main.ts" },
    files: ["server"], "bun-create": { postinstall: "bun run create/setup.ts" },
    scripts: { dev: "bun run --hot server/main.ts", start: "bun run server/main.ts", test: "bun test --coverage", setup: "bun run create/setup.ts" },
    dependencies: { "@blueshed/railroad": "^0.11.0" },
  }));
  writeFileSync(join(root, ".gitignore"), "node_modules\n.dev-site/\n");
  writeFileSync(join(root, "CLAUDE.md"), "duckdown's own notes");
  writeFileSync(join(root, ".claude", "launch.json"), "{}");
  for (const file of ["todo.jsonl", "bunfig.toml", "create/setup.ts", "tests/server.test.ts", "tests/example/seed"]) writeFileSync(join(root, file), file === "bunfig.toml" ? "# the suite's config\n" : "x");
}

describe("create: bun create blueshed/duckdown, and the code is yours", () => {
  const root = join(RUN, "created");

  test("keeps the code and its tests, drops duckdown's own project files, and adds the site", async () => {
    mkdirSync(root, { recursive: true });
    clone(root);
    const log = quiet();
    try {
      await setup(root);
      expect(said(log)).toContain("created is ready!");
      expect(said(log)).toContain("wrote site/");
    } finally {
      log.mockRestore();
    }

    // What it inherits: the code, the suite that holds it at 100%, the seed the suite runs against
    for (const kept of ["server", "tests/server.test.ts", "tests/example/seed", "bunfig.toml", ".claude/skills/railroad", ".claude/skills/bun-route", ".claude/skills/duckdown"]) {
      expect(existsSync(join(root, kept))).toBe(true);
    }
    // What was about duckdown as a project, and the script that ran once
    expect(existsSync(join(root, "create"))).toBe(false);
    expect(read(root, "todo.jsonl")).toBe("");                        // a fresh ledger, not duckdown's
    expect(read(root, "CLAUDE.md")).toBe("duckdown's own notes");     // theirs to keep: it describes the code they now have
    // duckdown's previews are dropped; the site's own dev server is written in their place
    expect(json(root, ".claude/launch.json").configurations).toEqual([{ name: "created", runtimeExecutable: "bun", runtimeArgs: ["run", "dev"], port: 8080 }]);

    const pkg = json(root, "package.json");
    expect(pkg).toMatchObject({ name: "created", version: "0.0.1", private: true });
    expect(pkg.bin).toBeUndefined();
    expect(pkg["bun-create"]).toBeUndefined();
    expect(pkg.scripts.setup).toBeUndefined();
    expect(pkg.scripts.test).toBe("bun test --coverage");             // theirs
    expect(pkg.scripts).toMatchObject(scripts(true));
    expect(pkg.scripts.dev).toBe("bun run --hot server/main.ts");
    expect(pkg.scripts.start).toBe("bun run server/serve.ts");
    expect(pkg.dependencies["@blueshed/railroad"]).toBe("^0.11.0");    // the code's own
    expect(pkg.dependencies.duckdown).toBeUndefined();                 // it *is* duckdown
    expect(pkg.devDependencies.railway).toBe("^3.11.0");               // resolves .railway/railway.ts's import

    expect(existsSync(join(root, "site", "static", "site.css"))).toBe(false);   // the base comes from server/base
    expect(read(root, ".gitignore")).toBe("node_modules\n.dev-site/\ndist/\n.dist.next-*/\n.dist.old-*/\n.env\n*.pid\n.DS_Store\nsite/users.json\nsite/.history/\n");
    const createdRailway = read(root, join(".railway", "railway.ts"));
    expect(createdRailway).toContain('service("created"');
    expect(createdRailway).toContain('start: "bun run server/serve.ts"');   // vendored: its own server/
    exportIn(root);
  });

  test("and running it again changes nothing that is there", async () => {
    writeFileSync(join(root, "site", "pages", "index.md"), "mine");
    const before = read(root, "package.json");
    const log = quiet();
    try {
      await setup(root);
    } finally {
      log.mockRestore();
    }
    expect(read(root, "site/pages/index.md")).toBe("mine");
    expect(read(root, "package.json")).toBe(before);
  });

  // bun create commits the copy, installs, then runs setup: what setup does is
  // the site's second commit, so it starts with nothing left to commit.
  const bunCreated = (name: string) => {
    const at = join(RUN, name);
    mkdirSync(at, { recursive: true });
    clone(at);
    sh(at, "init", "-q");
    sh(at, "config", "user.name", "x");
    sh(at, "config", "user.email", "x@example.com");
    sh(at, "config", "commit.gpgsign", "false");
    sh(at, "add", "-A");
    sh(at, "commit", "-q", "-m", "Initial commit (via bun create)");
    return at;
  };

  test("commits what it did, in the repository bun create made", async () => {
    const at = bunCreated("created-committed");
    const log = quiet();
    try {
      await setup(at);
      expect(said(log)).toContain("committed: Set up created-committed");
    } finally {
      log.mockRestore();
    }
    expect(sh(at, "status", "--porcelain")).toBe("");
    expect(sh(at, "log", "--format=%s")).toBe("Set up created-committed\nInitial commit (via bun create)\n");
  });

  test("but over changes of someone's own it commits nothing", async () => {
    const at = bunCreated("created-changed");
    writeFileSync(join(at, "mine.md"), "not setup's");
    const log = quiet();
    try {
      await setup(at);
      expect(said(log)).not.toContain("committed");
    } finally {
      log.mockRestore();
    }
    expect(sh(at, "log", "--format=%s")).toBe("Initial commit (via bun create)\n");
    expect(sh(at, "status", "--porcelain")).toContain("?? mine.md");
  });
});

describe("create: bunx github:blueshed/duckdown#vX create my-site, duckdown installed", () => {
  const version = json(repo, "package.json").version as string;
  const tags = `abc\trefs/tags/v0.1.0\ndef\trefs/tags/v${version}\n`;
  // GitHub and bun install stood in; git is real, in scratch folders, with an
  // identity of its own rather than whoever runs the suite.
  const stub = (answers: Record<string, { code: number; out: string }> = {}) => {
    const calls: string[] = [];
    const run: Run = async (cmd, cwd) => {
      calls.push(`${cmd.slice(0, 2).join(" ")} in ${cwd}`);
      return answers[cmd[1]!] ?? (cmd[1] === "ls-remote" ? { code: 0, out: tags } : { code: 0, out: "" });
    };
    return { run, calls };
  };
  const global = join(RUN, "gitconfig");
  writeFileSync(global, "[user]\n\tname = x\n\temail = x@example.com\n[commit]\n\tgpgsign = false\n");
  const own = { GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM };
  beforeAll(() => Object.assign(process.env, { GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: "1" }));
  afterAll(() => {
    for (const [key, value] of Object.entries(own)) value === undefined ? delete process.env[key] : (process.env[key] = value);
  });
  const lines: string[] = [];
  const say = (line: string) => void lines.push(line);

  test("makes the site pinned to its own tag, installs it, and commits it", async () => {
    const at = mkdtempSync(join(RUN, "create-"));
    const { run, calls } = stub();
    lines.length = 0;
    expect(await createCommand("my-site", { cwd: at, run, say })).toBe(0);
    const root = join(at, "my-site");
    expect(calls).toEqual([`git ls-remote in ${at}`, `bun install in ${root}`]);

    const pkg = json(root, "package.json");
    expect(pkg).toMatchObject({ name: "my-site", private: true });
    expect(pkg.dependencies.duckdown).toBe(`github:blueshed/duckdown#v${version}`);   // what upgrade moves
    expect(pkg.devDependencies.railway).toBe("^3.11.0");
    expect(pkg.scripts).toMatchObject(scripts(false));
    expect(read(root, ".railway/railway.ts")).toContain('source: github("your-org/my-site"');
    expect(read(root, "site/pages/index.md")).toContain("# Welcome to my-site");

    expect(sh(root, "log", "--format=%s")).toBe(`Created my-site with duckdown ${version}\n`);
    expect(sh(root, "status", "--porcelain")).toBe("");                              // .env and users.json are ignored
    expect(sh(root, "ls-files")).not.toContain("site/users.json");
    expect(lines).toContain("wrote my-site/site/");
    expect(lines).toContain(`committed: Created my-site with duckdown ${version}`);
    expect(lines.at(-1)).toContain(`my-site is ready, on duckdown v${version}`);
  });

  test("--deploy up, and inside a repository already it commits nothing", async () => {
    const at = mkdtempSync(join(RUN, "create-in-repo-"));
    sh(at, "init", "-q");
    lines.length = 0;
    expect(await createCommand("up-site", { deploy: "up", cwd: at, run: stub().run, say })).toBe(0);
    expect(read(join(at, "up-site"), ".railway/railway.ts")).toContain("railway up --service up-site");
    expect(existsSync(join(at, "up-site", ".git"))).toBe(false);
    expect(lines).toContain("inside a git repository already, so nothing is committed");
  });

  test("refuses before making anything: no name, a name taken, no tags, a version that isn't a release", async () => {
    const at = mkdtempSync(join(RUN, "create-refused-"));
    mkdirSync(join(at, "taken"));
    const make = (name: string | undefined, answers?: Record<string, { code: number; out: string }>) =>
      createCommand(name, { cwd: at, run: stub(answers).run, say });
    await expect(make(undefined)).rejects.toThrow("name the site in lower case letters, digits and dashes: duckdown create my-site");
    await expect(make("My Site")).rejects.toThrow("duckdown create my-site, not My Site");
    await expect(make("taken")).rejects.toThrow("taken is here already");
    await expect(make("a", { "ls-remote": { code: 128, out: "fatal: unable to access\n" } })).rejects.toThrow("couldn't read duckdown's tags from GitHub: fatal: unable to access");
    await expect(make("b", { "ls-remote": { code: 0, out: "abc\trefs/tags/v0.1.0\nabd\trefs/tags/v0.2.0\n" } }))
      .rejects.toThrow(`this is duckdown ${version}, which isn't a release to pin a site to: name one, as in bunx github:blueshed/duckdown#v0.2.0 create b`);
    await expect(make("c", { "ls-remote": { code: 0, out: "" } })).rejects.toThrow("#vX.Y.Z create c");
    expect(readdirSync(at)).toEqual(["taken"]);
  });

  test("an install that fails says the site is written but not installed", async () => {
    const at = mkdtempSync(join(RUN, "create-uninstalled-"));
    await expect(createCommand("d", { cwd: at, run: stub({ install: { code: 1, out: "error: no network\n" } }).run, say }))
      .rejects.toThrow("bun install failed in d/, which is written but not installed:\nerror: no network");
    expect(existsSync(join(at, "d", "site"))).toBe(true);
  });

  test("through the cli, a refusal is an exit code and a line", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await cli(["create"])).toBe(1);
      expect(String(error.mock.calls[0]![0])).toStartWith("duckdown create: name the site");
    } finally {
      error.mockRestore();
    }
  });

  test("a commit git refuses is said, not thrown", () => {
    expect(commitAll(mkdtempSync(join(RUN, "not-a-repo-")), "x")).toStartWith("not committed, so commit it yourself: fatal:");
  });
});

describe("install: bun add, then bunx duckdown init", () => {
  const root = join(RUN, "installed");

  test("adds the site around duckdown in node_modules, and pins nothing it wasn't asked to", async () => {
    mkdirSync(join(root, "node_modules"), { recursive: true });
    symlinkSync(repo, join(root, "node_modules", "duckdown"));
    // What bun add leaves: a package.json with the dependency in it, and the site's own script.
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "installed-site", scripts: { test: "x", dev: "my own dev" }, dependencies: { duckdown: "github:blueshed/duckdown#v0.2.0" },
    }));
    writeFileSync(join(root, ".gitignore"), "mine");
    const log = quiet();
    try {
      expect(await cli(["init"], root)).toBe(0);
      expect(said(log)).toContain("wrote site/");
      expect(said(log)).toContain('left alone: package.json script "dev" (the site\'s own)');
      expect(said(log)).toContain("Next: bun install");
    } finally {
      log.mockRestore();
    }

    const pkg = json(root, "package.json");
    expect(pkg.dependencies.duckdown).toBe("github:blueshed/duckdown#v0.2.0");   // as it was
    expect(pkg.scripts.dev).toBe("my own dev");                                    // never overwritten
    expect(pkg.scripts.test).toBe("x");
    expect(pkg.scripts.export).toBe("bun run node_modules/duckdown/server/export.ts");
    expect(pkg.scripts.start).toBe("bun run node_modules/duckdown/server/serve.ts");

    // The content, the config, the skill from the installed package
    expect(read(root, "site/pages/index.md")).toStartWith("title: installed\n\n# Welcome to installed");
    expect(read(root, "site/templates/site.html")).toBe(read(repo, "tests/example/templates/site.html"));
    // and the top bar it includes, so a new site has its nav and search
    expect(read(root, "site/templates/site.html")).toContain("{{include topbar}}");
    expect(read(root, "site/templates/topbar.html")).toBe(read(repo, "tests/example/templates/topbar.html"));
    expect(existsSync(join(root, "site", "static", "site.css"))).toBe(false);
    expect(read(root, ".env")).toStartWith("DUCKDOWN_PATH=./site\n");
    expect(read(root, ".gitignore")).toBe("mine\nnode_modules\ndist/\n.dist.next-*/\n.dist.old-*/\n.env\n*.pid\n.DS_Store\nsite/users.json\nsite/.history/\n");
    const installedRailway = read(root, join(".railway", "railway.ts"));
    expect(installedRailway).toContain('import { defineRailway, github, project, service } from "railway/iac"');
    expect(installedRailway).toContain('partial = "installed"');
    expect(installedRailway).toContain('service("installed"');
    expect(installedRailway).toContain('healthcheck: "/health"');
    expect(installedRailway).toContain('build: "bun run export --strict"');   // a deploy that fails on a broken page, as the live site stays
    expect(installedRailway).toContain('start: "bun run node_modules/duckdown/server/serve.ts"');
    expect(installedRailway).toContain('DUCKDOWN_PATH: "./site"');
    expect(installedRailway).toContain('project("installed"');
    expect(pkg.devDependencies.railway).toBe("^3.11.0");
    expect(read(root, "CLAUDE.md")).toContain("pinned dependency");
    expect(read(root, "CLAUDE.md")).toContain(".railway/railway.ts");
    expect(readdirSync(join(root, ".claude", "skills", "duckdown"))).toContain("SKILL.md");
    // Its own dev server, and none of the sites duckdown's own config previews
    expect(json(root, ".claude/launch.json").configurations).toEqual([{ name: "installed", runtimeExecutable: "bun", runtimeArgs: ["run", "dev"], port: 8080 }]);
    const users = json(root, "site/users.json");
    expect(await Bun.password.verify("admin", users.admin)).toBe(true);
    exportIn(root);
  });

  test("refuses to clobber: a second run leaves the site, the config and the scripts as they are, and says so", async () => {
    writeFileSync(join(root, "site", "pages", "index.md"), "Welcome to mine");
    writeFileSync(join(root, ".env"), "PORT=9000\n");
    const before = read(root, "package.json");
    const log = quiet();
    try {
      expect(await cli(["init"], root)).toBe(0);
      for (const kept of ["site/", ".env", join(".railway", "railway.ts"), "CLAUDE.md", ".claude/launch.json"]) {
        expect(said(log)).toContain(`left alone: ${kept}`);
      }
    } finally {
      log.mockRestore();
    }
    expect(read(root, "site/pages/index.md")).toBe("Welcome to mine");
    expect(read(root, ".env")).toBe("PORT=9000\n");
    expect(read(root, "package.json")).toBe(before);
  });

  test("with no package.json of its own it makes one, pinned to the installed version", async () => {
    const bare = join(RUN, "bare");
    mkdirSync(bare, { recursive: true });
    const log = quiet();
    try {
      expect(await cli(["init"], bare)).toBe(0);
    } finally {
      log.mockRestore();
    }
    const pkg = json(bare, "package.json");
    expect(pkg.dependencies.duckdown).toBe(`github:blueshed/duckdown#v${json(repo, "package.json").version}`);
    expect(pkg).toMatchObject({ name: "bare", private: true });
  });

  test("--deploy up writes the railway.ts of a site that goes out by railway up, and says so in its CLAUDE.md (n192)", async () => {
    for (const flag of [["--deploy", "up"], ["--deploy=up"]]) {
      const up = join(RUN, `deployed-by-up-${flag.length}`);
      mkdirSync(join(up, "node_modules"), { recursive: true });
      symlinkSync(repo, join(up, "node_modules", "duckdown"));
      const log = quiet();
      try {
        expect(await cli(["init", ...flag], up)).toBe(0);
      } finally {
        log.mockRestore();
      }
      const railway = read(up, join(".railway", "railway.ts"));
      expect(railway).not.toContain("github");
      expect(railway).toContain("railway up --service deployed-by-up");
      expect(railway).toContain('build: "bun run export --strict"');
      expect(railway).toContain('DUCKDOWN_PATH: "./site"');
      expect(read(up, "CLAUDE.md")).toContain("railway up --service deployed-by-up");
      expect(read(up, "CLAUDE.md")).not.toContain("repository's path on GitHub");
    }
    // The default is the GitHub one, and says so.
    expect(read(root, "CLAUDE.md")).toContain("repository's path on GitHub");
    expect(read(root, "CLAUDE.md")).toContain("bun run build     # the same with --strict");
    expect(read(root, "CLAUDE.md")).toContain("Couldn't find or open the file 'init'");
  });

  test("--deploy is github or up, and nothing else", async () => {
    const odd = join(RUN, "odd-deploy");
    mkdirSync(odd, { recursive: true });
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await cli(["init", "--deploy", "ftp"], odd)).toBe(1);
      expect(await cli(["init", "--deploy"], odd)).toBe(1);
      expect(String(error.mock.calls[0]![0])).toBe("duckdown init: --deploy is github (the default) or up (railway up), not ftp");
      expect(String(error.mock.calls[1]![0])).toBe("duckdown init: --deploy is github (the default) or up (railway up), not nothing");
    } finally {
      error.mockRestore();
    }
    expect(existsSync(join(odd, "site"))).toBe(false);
  });

  test("a folder that keeps its notes under .claude/ gets no second CLAUDE.md (n192)", async () => {
    const kept = join(RUN, "notes-under-claude");
    mkdirSync(join(kept, ".claude"), { recursive: true });
    writeFileSync(join(kept, ".claude", "CLAUDE.md"), "my notes");
    const log = quiet();
    try {
      expect(await cli(["init"], kept)).toBe(0);
      expect(said(log)).toContain("left alone: CLAUDE.md (.claude/CLAUDE.md is there)");
    } finally {
      log.mockRestore();
    }
    expect(existsSync(join(kept, "CLAUDE.md"))).toBe(false);
    expect(read(kept, ".claude/CLAUDE.md")).toBe("my notes");
  });

  test("an unreadable package.json is an exit code and a message, not a stack", async () => {
    const broken = join(RUN, "broken");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "package.json"), "{ not json");
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await cli(["init"], broken)).toBe(1);
      expect(String(error.mock.calls[0]![0])).toStartWith("duckdown init:");
    } finally {
      error.mockRestore();
    }
  });
});

describe("the two ways in differ in one thing", () => {
  test("the scripts' paths: replace the one and they are the other", () => {
    const vendored = scripts(true);
    const installed = scripts(false);
    expect(Object.keys(installed)).toEqual(Object.keys(vendored));
    for (const key of Object.keys(vendored)) {
      expect(installed[key]!.replace("node_modules/duckdown/server/", "server/")).toBe(vendored[key]!);
    }
  });

  test("and everything else the scaffold writes is the same", () => {
    const created = join(RUN, "created");
    const installed = join(RUN, "installed");
    // (index.md, CLAUDE.md and .railway/railway.ts all name the site or the way
    // in, so these are the ones that are byte for byte)
    for (const file of ["site/static/theme.css", "site/templates/site.html", "site/templates/topbar.html"]) {
      expect(read(created, file)).toBe(read(installed, file));
    }
  });
});

describe("duckdown, with no command", () => {
  test("is the server", async () => {
    // main is already loaded in this process (the tests' own server), so this
    // starts nothing new; it is the dispatch that is under test.
    expect(await cli([])).toBe(0);
    let started = false;
    expect(await cli(["serve"], "/", async () => void (started = true))).toBe(0);
    expect(started).toBe(true);
  });
});
