import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { gitEnv } from "./gitenv";
import type { Deploy } from "./init";
import { newest, spawnRun, type Run } from "./upgrade";

// `duckdown create <name>`: a new site with duckdown installed, in one line and
// from GitHub alone (on npm the name duckdown is someone else's):
//
//   bunx github:blueshed/duckdown create my-site
//
// Only a starter: it asks GitHub for the newest release, installs that, and
// runs that release's own init, so the site is made by the duckdown it runs,
// whichever duckdown this is — bunx runs master, and any tag since init would
// do. Then bun install again (init adds the railway package) and the first
// commit. The site is pinned to that release, as `duckdown upgrade` expects.
// To own the code instead: bun create blueshed/duckdown my-site (create/setup.ts).

// git in `cwd`, never in a repository the environment names (gitenv.ts).
export function git(args: string[], cwd: string): { code: number; out: string } {
  const ran = Bun.spawnSync(["git", ...args], { cwd, env: gitEnv(), stdout: "pipe", stderr: "pipe" });
  return { code: ran.exitCode, out: ran.stdout.toString() + ran.stderr.toString() };
}

// Everything in the repository at `root`, committed as one: what a new site
// starts from. A line to say, either way.
export function commitAll(root: string, message: string): string {
  const added = git(["add", "-A"], root);
  const done = added.code === 0 ? git(["commit", "-q", "-m", message], root) : added;
  return done.code === 0 ? `committed: ${message}` : `not committed, so commit it yourself: ${done.out.trim()}`;
}

export async function createCommand(
  name: string | undefined,
  o: { deploy?: Deploy; cwd?: string; run?: Run; say?: (line: string) => void } = {},
): Promise<number> {
  const { deploy = "github", cwd = process.cwd(), run = spawnRun, say = console.log } = o;
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(`name the site in lower case letters, digits and dashes: duckdown create my-site${name ? `, not ${name}` : ""}`);
  }
  const root = join(cwd, name);
  if (existsSync(root)) throw new Error(`${name} is here already: pick another name, or run duckdown init in it`);

  const tag = await newest(run, cwd);
  say(`Creating ${name} on duckdown v${tag}, the newest release...`);
  mkdirSync(root);
  writeFileSync(join(root, "package.json"), `${JSON.stringify({
    name, version: "0.0.1", private: true, dependencies: { duckdown: `github:blueshed/duckdown#v${tag}` },
  }, null, 2)}\n`);
  const step = async (what: string, cmd: string[]) => {
    const done = await run(cmd, root);
    if (done.code !== 0) throw new Error(`${what} failed in ${name}/, which is there but not finished:\n${done.out.trim()}`);
  };
  await step("bun install", ["bun", "install"]);
  await step(`duckdown v${tag}'s init`, ["bun", "run", join("node_modules", "duckdown", "server", "cli.ts"), "init", "--deploy", deploy]);
  await step("bun install", ["bun", "install"]);   // init adds railway, for .railway/railway.ts

  // Inside a repository already, the site is part of that one: not ours to commit to.
  if (git(["rev-parse", "--is-inside-work-tree"], cwd).code === 0) {
    say("inside a git repository already, so nothing is committed");
  } else {
    git(["init", "-q"], root);
    say(commitAll(root, `Created ${name} with duckdown ${tag}`));
  }
  say(`\n${name} is ready, on duckdown v${tag}:\n\n  cd ${name}\n  bun run dev       # the editor at http://localhost:8080/edit (admin/admin)\n`);
  return 0;
}
