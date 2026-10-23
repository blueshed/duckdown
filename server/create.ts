import { existsSync, mkdirSync, readFileSync } from "fs";
import { join } from "path";
import { gitEnv } from "./gitenv";
import { scaffold, type Deploy } from "./init";
import { latestTag, REPO, spawnRun, type Run } from "./upgrade";

// `duckdown create <name>`: a new site with duckdown installed, in one line and
// from GitHub alone (on npm the name duckdown is someone else's):
//
//   bunx github:blueshed/duckdown#v0.18.1 create my-site
//
// What the install way is by hand — a folder, the scaffold with the dependency
// pinned, bun install — and the site's first commit. The pin is the tag this
// ran from, read from duckdown's own package.json, so the same line always
// makes the same site. bunx with no #tag runs master, whose version may not be
// a tag yet: then nothing is made, and it says which line would work. To own
// the code instead: bun create blueshed/duckdown my-site (create/setup.ts).

const VERSION = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")).version as string;

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

  // The pin must be a tag GitHub has, or bun install fails with the site half made.
  const listed = await run(["git", "ls-remote", "--tags", "--refs", REPO], cwd);
  if (listed.code !== 0) throw new Error(`couldn't read duckdown's tags from GitHub: ${listed.out.trim()}`);
  if (!listed.out.split("\n").some((line) => line.endsWith(`refs/tags/v${VERSION}`))) {
    throw new Error(`this is duckdown ${VERSION}, which isn't a release to pin a site to: name one, as in bunx github:blueshed/duckdown#v${latestTag(listed.out) ?? "X.Y.Z"} create ${name}`);
  }

  mkdirSync(root);
  const { wrote } = await scaffold(root, { vendored: false, name, deploy });
  for (const path of wrote) say(`wrote ${name}/${path}`);
  const install = await run(["bun", "install"], root);
  if (install.code !== 0) throw new Error(`bun install failed in ${name}/, which is written but not installed:\n${install.out.trim()}`);

  // Inside a repository already, the site is part of that one: not ours to commit to.
  if (git(["rev-parse", "--is-inside-work-tree"], cwd).code === 0) {
    say("inside a git repository already, so nothing is committed");
  } else {
    git(["init", "-q"], root);
    say(commitAll(root, `Created ${name} with duckdown ${VERSION}`));
  }
  say(`\n${name} is ready, on duckdown v${VERSION}:\n\n  cd ${name}\n  bun run dev       # the editor at http://localhost:8080/edit (admin/admin)\n`);
  return 0;
}
