import { realpathSync } from "fs";
import { join, relative, sep } from "path";
import { APP_PATH, IS_S3, REMOTE } from "./config";
import { LocalStorage } from "./storage";
import { History, HISTORY_PATH } from "./history";

const HISTORY_DIR = HISTORY_PATH.replace(/\/$/, "");

// Where this site is published, when it is edited somewhere else: a local
// duckdown with DUCKDOWN_REMOTE set edits its own copy, and publishing is a
// push. One interface — status, push, pull — so the editor's Publish (n115)
// and Pull (n116) don't care what is on the other end. The first kind is git:
// the scaffold's Railway service builds the site from its repository, so a
// push is a publish, with nothing new to run.
//
// What is never pushed, whatever the kind: who can sign in (users.json), the
// editor's earlier versions (.history/) and what the site's own tasks wrote
// for its editors (reports/). Those belong to the machine they're on.

export type Change = { path: string; state: "added" | "changed" | "deleted" };

// What is here and not there, and there and not here. `path` is under the
// content folder ("pages/about.md"). `ahead` is what was committed here and not
// yet pushed; `behind` what the published side has that this copy hasn't, as
// of the last pull. `problem` is why neither can be known.
export type Status = { remote: string; changes: Change[]; ahead: number; behind: number; problem?: string };
export type Pushed = { committed: boolean; pushed: number };
export type Pulled = { changed: string[]; conflicts: string[] };

export interface Remote {
  name: string;
  status(): Promise<Status>;
  push(message: string, by: string): Promise<Pushed>;
  pull(by: string): Promise<Pulled>;
}

// A push or a pull that can't happen, for a reason the person can act on:
// answered as a line (409), not as a server error.
export class RemoteRefused extends Error {
  constructor(message: string) {   // written out: an implicit constructor is a function coverage counts and never sees
    super(message);
  }
}

export const NEVER = ["users.json", HISTORY_DIR, "reports"];

// The remote DUCKDOWN_REMOTE names, or null when it names none — then nothing
// changes, and the editor offers no Publish.
export function remoteFrom(spec = REMOTE, contentDir = APP_PATH, isS3 = IS_S3): Remote | null {
  if (!spec) return null;
  if (spec !== "git") throw new Error(`DUCKDOWN_REMOTE=${spec}: the one kind so far is git`);
  if (isS3) throw new Error("DUCKDOWN_REMOTE=git needs the site in a folder on disk, not a bucket");
  return gitRemote(contentDir);
}

// --- git -----------------------------------------------------------------

type Ran = { code: number; out: string; err: string; bytes: Uint8Array };

async function git(cwd: string, args: string[]): Promise<Ran> {
  // Never stop to ask for a password: there is nobody at this terminal.
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  const [bytes, err, code] = await Promise.all([new Response(proc.stdout).bytes(), new Response(proc.stderr).text(), proc.exited]);
  return { code, out: new TextDecoder().decode(bytes), err, bytes };
}

// A git command that has to work: its own words when it doesn't.
async function must(cwd: string, args: string[]): Promise<string> {
  const ran = await git(cwd, args);
  if (ran.code !== 0) throw new RemoteRefused(`git ${args[0]}: ${(ran.err || ran.out).trim()}`);
  return ran.out;
}

// `git status --porcelain -z`: "XY path\0", and a rename's old path after it.
export function parseStatus(out: string, under: string): Change[] {
  const changes: Change[] = [];
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]!;
    if (entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    const path = entry.slice(3);
    const state: Change["state"] = xy === "??" || xy.includes("A") ? "added" : xy.includes("D") ? "deleted" : "changed";
    if (xy.includes("R")) {
      changes.push({ path: parts[++i]!, state: "deleted" });
      changes.push({ path, state: "added" });
    } else {
      changes.push({ path, state });
    }
  }
  const cut = under ? `${under}/` : "";
  return changes.map((c) => ({ ...c, path: c.path.slice(cut.length) }));
}

export function gitRemote(contentDir: string, keep = (section: string) => new History(new LocalStorage(join(contentDir, HISTORY_DIR, section)))): Remote {
  let found: Promise<{ root: string; under: string }> | null = null;

  // The repository the content folder is in, and where in it: "site" for the
  // scaffold's layout, "" when the site is the repository.
  const where = () => (found ??= (async () => {
    const top = await git(contentDir, ["rev-parse", "--show-toplevel"]);
    if (top.code !== 0) throw new RemoteRefused(`${contentDir} isn't in a git repository, so DUCKDOWN_REMOTE=git has nowhere to push`);
    const root = top.out.trim();
    return { root, under: relative(realpathSync(root), realpathSync(contentDir)).split(sep).join("/") };
  })());

  // The content folder, and never what stays on this machine.
  const paths = (under: string) => [
    under || ".",
    ...NEVER.map((n) => `:(exclude)${under ? `${under}/` : ""}${n}`),
  ];

  const upstream = async (root: string) => {
    const ran = await git(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    if (ran.code !== 0) return null;
    const name = ran.out.trim();
    const slash = name.indexOf("/");
    return { name, remote: name.slice(0, slash), branch: name.slice(slash + 1) };
  };

  const changesIn = async (root: string, under: string) =>
    parseStatus(await must(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...paths(under)]), under);

  const counts = async (root: string) => {
    const [ahead, behind] = (await must(root, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])).trim().split(/\s+/).map(Number);
    return { ahead: ahead!, behind: behind! };
  };

  // A commit of the content folder's changes, and only those: whatever else is
  // staged in the repository stays as it was.
  const commit = async (root: string, under: string, message: string, by: string) => {
    await must(root, ["add", "-A", "--", ...paths(under)]);
    await must(root, ["commit", "-m", message, "-m", `Edited-by: ${by}`, "--", ...paths(under)]);
  };

  const self: Remote = {
    name: "git",

    async status() {
      const { root, under } = await where();
      const changes = await changesIn(root, under);
      const up = await upstream(root);
      if (!up) {
        return { remote: "git", changes, ahead: 0, behind: 0, problem: "This branch has no upstream to publish to: push it once with git push -u" };
      }
      return { remote: `git ${up.name}`, changes, ...await counts(root) };
    },

    async push(message, by) {
      const { root, under } = await where();
      const up = await upstream(root);
      if (!up) throw new RemoteRefused("This branch has no upstream to publish to: push it once with git push -u");
      const changes = await changesIn(root, under);
      if (changes.length) await commit(root, under, message, by);
      const { ahead } = await counts(root);
      if (!ahead) return { committed: false, pushed: 0 };
      const ran = await git(root, ["push", up.remote, `HEAD:${up.branch}`]);
      if (ran.code !== 0) {
        if (/rejected|fetch first|non-fast-forward/.test(ran.err)) {
          throw new RemoteRefused("The published site has changes this copy hasn't: Pull, then Publish again");
        }
        throw new RemoteRefused(`git push: ${ran.err.trim()}`);
      }
      return { committed: changes.length > 0, pushed: ahead };
    },

    // What the published side has, brought in. Edits here that aren't
    // committed yet are committed first, so nothing is lost in the merge. A
    // file changed on both sides keeps this copy's version — the one the
    // person pulling is looking at — and the published one goes into its
    // earlier versions, where Restore can bring it back.
    async pull(by) {
      const { root, under } = await where();
      const up = await upstream(root);
      if (!up) throw new RemoteRefused("This branch has no upstream to pull from: push it once with git push -u");
      await must(root, ["fetch", up.remote]);
      if (!(await counts(root)).behind) return { changed: [], conflicts: [] };
      if ((await changesIn(root, under)).length) await commit(root, under, "Edits kept before pulling", by);
      const before = (await must(root, ["rev-parse", "HEAD"])).trim();
      const merged = await git(root, ["merge", "--no-edit", up.name]);
      const conflicts: string[] = [];
      if (merged.code !== 0) {
        const unmerged = (await must(root, ["diff", "--name-only", "--diff-filter=U", "-z"])).split("\0").filter(Boolean);
        const cut = under ? `${under}/` : "";
        if (!unmerged.length || unmerged.some((p) => !p.startsWith(cut))) {
          await git(root, ["merge", "--abort"]);
          throw new RemoteRefused(`Pulling needs a hand in git: ${(merged.err || merged.out).trim().split("\n")[0]}`);
        }
        for (const path of unmerged) {
          const theirs = await git(root, ["show", `:3:${path}`]);
          const ours = await git(root, ["cat-file", "-e", `:2:${path}`]);
          if (ours.code === 0) await must(root, ["checkout", "--ours", "--", path]);
          await must(root, ours.code === 0 ? ["add", "--", path] : ["rm", "--quiet", "--", path]);
          const inside = path.slice(cut.length);
          // Kept where the editor's Earlier versions look: pages/about.md is
          // about.md in the pages history. A picture is kept as its bytes.
          if (theirs.code === 0) {
            const slash = inside.indexOf("/");
            await keep(inside.slice(0, Math.max(slash, 0))).save(inside.slice(slash + 1), theirs.bytes, true);
          }
          conflicts.push(inside);
        }
        await must(root, ["commit", "--no-edit"]);
      }
      const changed = (await must(root, ["diff", "--name-only", "-z", before, "HEAD", "--", ...paths(under)]))
        .split("\0").filter(Boolean).map((p) => p.slice(under ? under.length + 1 : 0));
      return { changed, conflicts };
    },
  };
  return self;
}
