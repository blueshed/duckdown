// The two ways in, and the one scaffold behind them. create/setup.ts deletes
// things, so it only ever runs here on a scratch copy of the repo's shape,
// never on the repo itself.
import { describe, test, expect, spyOn } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, readFileSync, symlinkSync, readdirSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { setup } from "../create/setup";
import { cli } from "../server/cli";
import { scripts } from "../server/init";

const repo = join(import.meta.dir, "..");
const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
const json = (root: string, path: string) => JSON.parse(read(root, path));
const quiet = () => spyOn(console, "log").mockImplementation(() => {});
const said = (log: ReturnType<typeof quiet>) => log.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");

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
  expect(existsSync(join(root, "dist", "search.json"))).toBe(true);
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
  for (const file of ["feature.md", "todo.jsonl", "bunfig.toml", "create/setup.ts", "tests/server.test.ts", "tests/example/seed"]) writeFileSync(join(root, file), file === "bunfig.toml" ? "# the suite's config\n" : "x");
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
    for (const gone of ["feature.md", "create"]) expect(existsSync(join(root, gone))).toBe(false);
    expect(read(root, "todo.jsonl")).toBe("");                        // a fresh ledger, not duckdown's
    expect(read(root, "CLAUDE.md")).toBe("duckdown's own notes");     // theirs to keep: it describes the code they now have

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
    expect(read(root, ".gitignore")).toBe("node_modules\n.dev-site/\ndist/\n.env\n*.pid\n.DS_Store\nsite/users.json\nsite/.history/\n");
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
    expect(existsSync(join(root, "site", "static", "site.css"))).toBe(false);
    expect(read(root, ".env")).toStartWith("DUCKDOWN_PATH=./site\n");
    expect(read(root, ".gitignore")).toBe("mine\nnode_modules\ndist/\n.env\n*.pid\n.DS_Store\nsite/users.json\nsite/.history/\n");
    const installedRailway = read(root, join(".railway", "railway.ts"));
    expect(installedRailway).toContain('import { defineRailway, github, project, service } from "railway/iac"');
    expect(installedRailway).toContain('partial = "installed"');
    expect(installedRailway).toContain('service("installed"');
    expect(installedRailway).toContain('healthcheck: "/health"');
    expect(installedRailway).toContain('build: "bun run export"');
    expect(installedRailway).toContain('start: "bun run node_modules/duckdown/server/serve.ts"');
    expect(installedRailway).toContain('DUCKDOWN_PATH: "./site"');
    expect(installedRailway).toContain('project("installed"');
    expect(pkg.devDependencies.railway).toBe("^3.11.0");
    expect(read(root, "CLAUDE.md")).toContain("pinned dependency");
    expect(read(root, "CLAUDE.md")).toContain(".railway/railway.ts");
    expect(readdirSync(join(root, ".claude", "skills", "duckdown"))).toContain("SKILL.md");
    expect(existsSync(join(root, ".claude", "launch.json"))).toBe(true);
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
    for (const file of ["site/static/theme.css", "site/templates/site.html"]) {
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
