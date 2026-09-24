// n114–n116: a remote site, the git kind — against real repositories: a bare
// one for what the site is published from, the copy being edited here, and a
// second clone for someone publishing from somewhere else.
import { describe, test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, renameSync } from "fs";
import { join } from "path";
import { RUN } from "./helpers";
import { remoteFrom, gitRemote, parseStatus, RemoteRefused } from "../server/remote";

function sh(cwd: string, ...args: string[]): string {
  const ran = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (ran.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${ran.stderr.toString()}`);
  return ran.stdout.toString();
}

// A clone that can commit anywhere: its own name, and no signing.
function clone(origin: string, name: string): string {
  const dir = join(mkdtempSync(join(RUN, `${name}-`)), "repo");
  sh(RUN, "clone", "-q", origin, dir);
  sh(dir, "config", "user.name", name);
  sh(dir, "config", "user.email", `${name}@example.com`);
  sh(dir, "config", "commit.gpgsign", "false");
  return dir;
}

const put = (dir: string, path: string, body: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), body);
};

// The scaffold's layout: the site in site/, beside the code.
function sites(under = "site") {
  const origin = join(mkdtempSync(join(RUN, "origin-")), "site.git");
  sh(RUN, "init", "-q", "--bare", "-b", "main", origin);
  const here = clone(origin, "here");
  const content = under ? join(here, under) : here;
  put(content, "pages/index.md", "title: Home\n\nhello\n");
  put(content, "pages/about.md", "title: About\n");
  put(here, "README.md", "the code\n");
  sh(here, "add", "-A");
  sh(here, "commit", "-q", "-m", "start");
  sh(here, "push", "-q", "-u", "origin", "main");
  const there = clone(origin, "there");
  return { origin, here, content, there, thereContent: under ? join(there, under) : there };
}

const lastMessage = (dir: string) => sh(dir, "log", "-1", "--format=%B").trim();

describe("remoteFrom", () => {
  test("nothing unless DUCKDOWN_REMOTE says; one kind so far, and it needs a folder", () => {
    expect(remoteFrom("", "/x", false)).toBeNull();
    expect(() => remoteFrom("svn", "/x", false)).toThrow("DUCKDOWN_REMOTE=svn: the one kind so far is git");
    expect(() => remoteFrom("git", "/x", true)).toThrow("needs the site in a folder on disk, not a bucket");
    expect(remoteFrom("git", "/x", false)!.name).toBe("git");
    expect(remoteFrom()).toBeNull();                                       // DUCKDOWN_REMOTE isn't set for the tests
  });

  test("git status, read: renames, and paths under the content folder", () => {
    expect(parseStatus(" M site/pages/a.md\0?? site/pages/b.md\0R  site/pages/new.md\0site/pages/old.md\0 D site/pages/gone.md\0", "site")).toEqual([
      { path: "pages/a.md", state: "changed" },
      { path: "pages/b.md", state: "added" },
      { path: "pages/old.md", state: "deleted" },
      { path: "pages/new.md", state: "added" },
      { path: "pages/gone.md", state: "deleted" },
    ]);
    expect(parseStatus("A  pages/a.md\0", "")).toEqual([{ path: "pages/a.md", state: "added" }]);
  });
});

describe("the git kind", () => {
  test("status: the content folder's changes, never what stays on this machine", async () => {
    const s = sites();
    const remote = gitRemote(s.content);
    expect(await remote.status()).toEqual({ remote: "git origin/main", changes: [], ahead: 0, behind: 0 });
    put(s.content, "pages/index.md", "title: Home\n\nhello again\n");
    put(s.content, "pages/new.md", "title: New\n");
    rmSync(join(s.content, "pages/about.md"));
    put(s.content, "users.json", "{}");
    put(s.content, ".history/pages/index.md/2026-01-01T00-00-00-000Z", "old");
    put(s.content, "reports/2026-09/2026-09-24.md", "# a report");
    put(s.here, "notes.txt", "outside the site");
    const { changes } = await remote.status();
    expect(changes.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: "pages/about.md", state: "deleted" },
      { path: "pages/index.md", state: "changed" },
      { path: "pages/new.md", state: "added" },
    ]);
  });

  test("push: one commit of the content folder only, saying who edited, then pushed", async () => {
    const s = sites();
    const remote = gitRemote(s.content);
    put(s.content, "pages/new.md", "title: New\n");
    put(s.content, "users.json", "{\"admin\":\"hash\"}");
    put(s.here, "code.ts", "staged, and not the site's");
    sh(s.here, "add", "code.ts");
    expect(await remote.push("Edited: pages/new.md", "ann")).toEqual({ committed: true, pushed: 1 });
    expect(lastMessage(s.here)).toBe("Edited: pages/new.md\n\nEdited-by: ann");
    expect(sh(s.here, "show", "--name-only", "--format=", "HEAD").trim()).toBe("site/pages/new.md");
    expect(sh(s.here, "diff", "--cached", "--name-only").trim()).toBe("code.ts");     // still staged, still theirs
    sh(s.there, "pull", "-q");
    expect(readFileSync(join(s.thereContent, "pages/new.md"), "utf8")).toBe("title: New\n");
    expect(existsSync(join(s.thereContent, "users.json"))).toBe(false);
    // Nothing more to say, nothing to push.
    expect(await remote.push("again", "ann")).toEqual({ committed: false, pushed: 0 });
  });

  test("a push the published side has moved past is refused, and the commit waits here", async () => {
    const s = sites();
    put(s.thereContent, "pages/there.md", "title: From there\n");
    sh(s.there, "add", "-A");
    sh(s.there, "commit", "-q", "-m", "there");
    sh(s.there, "push", "-q");
    const remote = gitRemote(s.content);
    put(s.content, "pages/here.md", "title: From here\n");
    await expect(remote.push("here", "ann")).rejects.toThrow("The published site has changes this copy hasn't: Pull, then Publish again");
    expect((await remote.status()).ahead).toBe(1);

    // Pull brings theirs in beside ours; Publish then sends both.
    expect(await remote.pull("ann")).toEqual({ changed: ["pages/there.md"], conflicts: [] });
    expect(readFileSync(join(s.content, "pages/there.md"), "utf8")).toBe("title: From there\n");
    expect(await remote.push("nothing new", "ann")).toEqual({ committed: false, pushed: 2 });
  });

  test("pull: edits not yet committed are kept first; a file changed on both sides keeps this copy's, and theirs goes to its earlier versions", async () => {
    const s = sites();
    put(s.thereContent, "pages/index.md", "title: Home\n\ntheirs\n");
    rmSync(join(s.thereContent, "pages/about.md"));
    put(s.thereContent, "pages/logo.png", "\x89PNG theirs");
    sh(s.there, "add", "-A");
    sh(s.there, "commit", "-q", "-m", "there");
    sh(s.there, "push", "-q");
    put(s.content, "pages/index.md", "title: Home\n\nours\n");                // both changed it
    put(s.content, "pages/logo.png", "\x89PNG ours");                        // both added it
    const remote = gitRemote(s.content);
    const pulled = await remote.pull("ann");
    expect(pulled.conflicts.sort()).toEqual(["pages/index.md", "pages/logo.png"]);
    expect(pulled.changed).toContain("pages/about.md");                       // their delete came in
    expect(readFileSync(join(s.content, "pages/index.md"), "utf8")).toBe("title: Home\n\nours\n");
    expect(existsSync(join(s.content, "pages/about.md"))).toBe(false);
    const kept = join(s.content, ".history/pages/index.md");
    expect(readFileSync(join(kept, readdirSync(kept)[0]!), "utf8")).toBe("title: Home\n\ntheirs\n");
    const picture = join(s.content, ".history/pages/logo.png");
    expect(readFileSync(join(picture, readdirSync(picture)[0]!))).toEqual(Buffer.from("\x89PNG theirs"));
    expect(sh(s.here, "log", "--format=%s", "-3")).toContain("Edits kept before pulling");
    expect(sh(s.here, "status", "--porcelain", "--", "site").trim()).toBe("?? site/.history/");   // merged and clean, the history aside
    expect(await remote.pull("ann")).toEqual({ changed: [], conflicts: [] });   // nothing new
  });

  test("a file this copy deleted and they changed stays deleted, theirs kept", async () => {
    const s = sites();
    put(s.thereContent, "pages/about.md", "title: About, changed there\n");
    sh(s.there, "commit", "-q", "-am", "there");
    sh(s.there, "push", "-q");
    rmSync(join(s.content, "pages/about.md"));
    const remote = gitRemote(s.content);
    expect((await remote.pull("ann")).conflicts).toEqual(["pages/about.md"]);
    expect(existsSync(join(s.content, "pages/about.md"))).toBe(false);
    const kept = join(s.content, ".history/pages/about.md");
    expect(readFileSync(join(kept, readdirSync(kept)[0]!), "utf8")).toBe("title: About, changed there\n");
  });

  test("a conflict outside the site folder is git's to settle, not duckdown's", async () => {
    const s = sites();
    put(s.there, "README.md", "theirs\n");
    sh(s.there, "commit", "-q", "-am", "there");
    sh(s.there, "push", "-q");
    put(s.here, "README.md", "ours\n");
    sh(s.here, "commit", "-q", "-am", "here");
    await expect(gitRemote(s.content).pull("ann")).rejects.toThrow("Pulling needs a hand in git:");
    expect(sh(s.here, "status", "--porcelain").trim()).toBe("");                // the merge was taken back
  });

  test("a push that can't reach the published side says so in git's own words", async () => {
    const s = sites();
    renameSync(s.origin, `${s.origin}.away`);
    put(s.content, "pages/new.md", "title: New\n");
    await expect(gitRemote(s.content).push("new", "ann")).rejects.toThrow("git push:");
  });

  test("a site that is the whole repository works the same", async () => {
    const s = sites("");
    const remote = gitRemote(s.content);
    put(s.content, "pages/new.md", "title: New\n");
    put(s.content, "users.json", "{}");
    expect((await remote.status()).changes).toEqual([{ path: "pages/new.md", state: "added" }]);
    expect(await remote.push("new", "ann")).toEqual({ committed: true, pushed: 1 });
  });

  test("says what's missing: a repository, an upstream", async () => {
    const bare = mkdtempSync(join(RUN, "no-repo-"));
    await expect(gitRemote(bare).status()).rejects.toThrow(`${bare} isn't in a git repository, so DUCKDOWN_REMOTE=git has nowhere to push`);
    const lone = join(mkdtempSync(join(RUN, "lone-")), "repo");
    sh(RUN, "init", "-q", "-b", "main", lone);
    sh(lone, "config", "user.name", "x");
    sh(lone, "config", "user.email", "x@example.com");
    sh(lone, "config", "commit.gpgsign", "false");
    put(lone, "pages/index.md", "hi");
    sh(lone, "add", "-A");
    sh(lone, "commit", "-q", "-m", "one");
    const remote = gitRemote(lone);
    expect((await remote.status()).problem).toBe("This branch has no upstream to publish to: push it once with git push -u");
    await expect(remote.push("x", "ann")).rejects.toThrow("no upstream to publish to");
    await expect(remote.pull("ann")).rejects.toThrow("no upstream to pull from");
    await expect(gitRemote(join(lone, "pages")).status()).resolves.toMatchObject({ changes: [] });
    expect(RemoteRefused.name).toBe("RemoteRefused");
  });
});
