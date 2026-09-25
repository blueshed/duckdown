// n114–n116: a remote site, the git kind — against real repositories: a bare
// one for what the site is published from, the copy being edited here, and a
// second clone for someone publishing from somewhere else.
import { describe, test, expect, beforeAll, spyOn } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, renameSync } from "fs";
import { join } from "path";
import { RUN, BASE, signIn, authed } from "./helpers";
import { remoteFrom, gitRemote, parseStatus, RemoteRefused, defaultMessage, publishSite, remoteCommand, type Remote } from "../server/remote";
import { publishRoutes } from "../server/routes/publish";
import { checkSite } from "../server/export";
import { cli } from "../server/cli";

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
  // What the scaffold ignores. git add refuses to be told about ignored files,
  // even to leave them out, which is how a first version of this failed.
  put(here, ".gitignore", under ? `${under}/users.json\n${under}/.history/\n` : "users.json\n.history/\n");
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
    expect(sh(s.here, "status", "--porcelain", "--", "site").trim()).toBe("");   // merged and clean (the history is ignored, as a site ignores it)
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

// n115: publishing — checked, then pushed — and n116's pull, from the editor's route and the command line.
describe("publishing", () => {
  beforeAll(signIn);
  const request = (method: string, path = "/edit/publish", body?: unknown) =>
    new Request(`${BASE}${path}`, { method, headers: { ...(authed().headers as Record<string, string>), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }) as any;

  test("the checks are the export's: its problems, or why there was nothing to export", async () => {
    expect(await checkSite()).toEqual([]);                                 // the seed site is clean
    expect(await checkSite(async (o) => {
      o.say!("broken link: a.html -> /nowhere.html");
      o.say!("collection: gallery/collection.json: something");
      o.say!("12 page(s) written");
      return {} as never;
    })).toEqual(["broken link: a.html -> /nowhere.html", "collection: gallery/collection.json: something"]);
    expect(await checkSite(async () => { throw new Error("No pages to export"); })).toEqual(["No pages to export"]);
  });

  test("a commit says what changed when the person didn't", () => {
    expect(defaultMessage([])).toBe("Published from duckdown");
    expect(defaultMessage([{ path: "pages/a.md", state: "changed" }])).toBe("Edited pages/a.md");
    const five = ["a", "b", "c", "d", "e"].map((n) => ({ path: `pages/${n}.md`, state: "added" as const }));
    expect(defaultMessage(five)).toBe("Edited pages/a.md, pages/b.md, pages/c.md and 2 more");
  });

  test("the route: status, a publish with what the checks found, strict refusal, and a pull", async () => {
    const s = sites();
    const routes = publishRoutes(gitRemote(s.content), async () => ["broken link: index.html -> /gone.html"]);   // strict as the environment says: not
    put(s.content, "pages/new.md", "title: New\n");
    const status = await (await routes.GET(request("GET"))).json();
    expect(status).toEqual({ remote: "git origin/main", changes: [{ path: "pages/new.md", state: "added" }], ahead: 0, behind: 0 });

    const published = await (await routes.POST(request("POST", "/edit/publish", {}))).json();
    expect(published).toEqual({ committed: true, pushed: 1, problems: ["broken link: index.html -> /gone.html"] });
    expect(lastMessage(s.here)).toBe("Edited pages/new.md\n\nEdited-by: admin");

    put(s.content, "pages/more.md", "title: More\n");
    const strict = publishRoutes(gitRemote(s.content), async () => ["broken link: x -> y"], () => true);
    const refused = await strict.POST(request("POST", "/edit/publish", { message: "more" }));
    expect(refused.status).toBe(409);
    expect(await refused.text()).toBe("Not published: 1 problem(s), and DUCKDOWN_STRICT is on — broken link: x -> y");
    expect(await (await routes.POST(request("POST", "/edit/publish", { message: "  More, said  " }))).json())
      .toMatchObject({ committed: true, pushed: 1 });
    expect(lastMessage(s.here)).toBe("More, said\n\nEdited-by: admin");

    put(s.thereContent, "pages/there.md", "title: There\n");
    sh(s.there, "add", "-A");
    sh(s.there, "commit", "-q", "-m", "there");
    sh(s.there, "pull", "-q", "--no-rebase");
    sh(s.there, "push", "-q");
    expect(await (await routes.POST(request("POST", "/edit/publish?pull"))).json()).toEqual({ changed: ["pages/there.md"], conflicts: [] });
    expect(await (await routes.POST(request("POST", "/edit/publish?pull"))).json()).toEqual({ changed: [], conflicts: [] });
    // No body at all is a publish with nothing said, and here, nothing to publish.
    expect(await (await routes.POST(request("POST"))).json()).toMatchObject({ committed: false, pushed: 0 });
  });

  test("the route says what it can't do, and a failure that isn't a reason is still a failure", async () => {
    const lone = publishRoutes(gitRemote(mkdtempSync(join(RUN, "not-a-repo-"))));
    const res = await lone.GET(request("GET"));
    expect(res.status).toBe(409);
    expect(await res.text()).toContain("isn't in a git repository");
    const broken = { name: "x", status: async () => { throw new Error("disk on fire"); } } as unknown as Remote;
    await expect(publishRoutes(broken).GET(request("GET"))).rejects.toThrow("disk on fire");
    // This server has no remote: nothing to publish, and signed out, nothing at all.
    const status = await fetch(`${BASE}/edit/publish`, authed());
    expect(status.status).toBe(200);                    // nothing to publish is an answer, not a miss
    expect(await status.json()).toBeNull();
    const publish = await fetch(`${BASE}/edit/publish`, authed({ method: "POST" }));
    expect(publish.status).toBe(404);
    expect(await publish.text()).toBe("This site isn't published from here: set DUCKDOWN_REMOTE");
    expect((await fetch(`${BASE}/edit/publish`)).status).toBe(401);
    expect((await fetch(`${BASE}/edit/publish`, { method: "POST" })).status).toBe(401);
  });

  test("duckdown publish and duckdown pull, signed as whoever runs them", async () => {
    const s = sites();
    const remote = gitRemote(s.content);
    const said: string[] = [];
    const say = (l: string) => said.push(l);
    const env = { USER: "pat" };
    put(s.content, "pages/new.md", "title: New\n");
    expect(await remoteCommand("publish", ["A", "new", "page"], remote, say, async () => ["broken link: a -> b"], env)).toBe(0);
    expect(lastMessage(s.here)).toBe("A new page\n\nEdited-by: pat");
    expect(await remoteCommand("publish", [], remote, say, async () => [], {})).toBe(0);
    await expect(publishSite(remote, { by: "pat", checks: async () => ["x"], strict: true })).rejects.toThrow("DUCKDOWN_STRICT");
    await expect(remoteCommand("publish", [], remote, say, async () => ["x"], { DUCKDOWN_STRICT: "1" })).rejects.toThrow("Not published");
    expect(await remoteCommand("pull", [], remote, say, undefined, env)).toBe(0);
    sh(s.there, "pull", "-q", "--no-rebase");
    put(s.thereContent, "pages/new.md", "title: New, theirs\n");
    sh(s.there, "commit", "-q", "-am", "theirs");
    sh(s.there, "push", "-q");
    put(s.content, "pages/new.md", "title: New, ours\n");
    expect(await remoteCommand("pull", [], remote, say, undefined, env)).toBe(0);
    expect(said).toEqual([
      "problem: broken link: a -> b",
      "Published: 1 commit(s) pushed to git origin/main",
      "Nothing to publish",
      "Nothing new to pull",
      "Pulled: everything that changed there was changed here too",
      "changed on both sides, kept yours: pages/new.md (theirs is in its earlier versions)",
    ]);
    await expect(remoteCommand("pull", [], null)).rejects.toThrow("This site isn't published from here: set DUCKDOWN_REMOTE (git)");
  });

  test("they are duckdown commands, and with no remote they say so and fail", async () => {
    const error = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await cli(["publish"])).toBe(1);
      expect(await cli(["pull"])).toBe(1);
      expect(error.mock.calls[0]![0]).toBe("duckdown publish: This site isn't published from here: set DUCKDOWN_REMOTE (git)");
    } finally {
      error.mockRestore();
    }
  });
});
