import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { join, relative } from "path";
import { tmpdir } from "os";

// `duckdown upgrade [tag]`, run in a site that has duckdown as a dependency:
// what an upgrade by hand is, done the same way every time. Export the site
// with the duckdown it has, pin the new tag, install, refresh the site's copy
// of the authoring skill, export again, and compare every file — then say
// what changed and what the changelog says came in between. A version that
// can't export the site is put back. It commits nothing: that, and pulling a
// site's content from wherever else it lives first, stay the site's.

const PIN = /^(github:blueshed\/duckdown)#v(\d+\.\d+\.\d+)$/;
const REPO = "https://github.com/blueshed/duckdown.git";
const SKILL = join(".claude", "skills", "duckdown");

export type Run = (cmd: string[], cwd: string) => Promise<{ code: number; out: string }>;

export const spawnRun: Run = async (cmd, cwd) => {
  const proc = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  return { code: await proc.exited, out: out + err };
};

// "1.2.10" after "1.2.9": numbers, not text.
export const newer = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x![i] !== y![i]) return x![i]! > y![i]!;
  return false;
};

// The newest vX.Y.Z tag in `git ls-remote --tags` output, without its v.
export function latestTag(listing: string): string | null {
  const tags = [...listing.matchAll(/refs\/tags\/v(\d+\.\d+\.\d+)$/gm)].map((m) => m[1]!);
  return tags.reduce<string | null>((best, t) => (!best || newer(t, best) ? t : best), null);
}

// The changelog's entries after `from`, up to and including `to`.
export function changesBetween(changelog: string, from: string, to: string): string {
  return changelog.split(/^(?=## )/m)
    .filter((s) => {
      const v = s.match(/^## (\d+\.\d+\.\d+)/)?.[1];
      return v !== undefined && newer(v, from) && !newer(v, to);
    })
    .join("")
    .trim();
}

// Every file under `dir`, by its path inside it.
function files(dir: string, at = dir): string[] {
  return readdirSync(at).flatMap((name) => {
    const path = join(at, name);
    return statSync(path).isDirectory() ? files(dir, path) : [relative(dir, path)];
  });
}

// What an export writes differently: files it adds, drops, or changes.
export function compare(before: string, after: string): { same: number; added: string[]; removed: string[]; changed: string[] } {
  const was = new Set(files(before));
  const now = files(after);
  const out = { same: 0, added: [] as string[], removed: [] as string[], changed: [] as string[] };
  for (const path of now) {
    if (!was.has(path)) out.added.push(path);
    else if (readFileSync(join(before, path)).equals(readFileSync(join(after, path)))) out.same++;
    else out.changed.push(path);
    was.delete(path);
  }
  out.removed = [...was];
  return out;
}

// The newest tag duckdown has published, asked of GitHub.
async function newest(run: Run, cwd: string): Promise<string> {
  const listed = await run(["git", "ls-remote", "--tags", "--refs", REPO], cwd);
  const tag = listed.code === 0 ? latestTag(listed.out) : null;
  if (!tag) throw new Error(`couldn't read duckdown's tags: ${listed.out.trim() || "none found"}`);
  return tag;
}

export async function upgradeCommand(
  args: string[],
  o: { cwd?: string; run?: Run; say?: (line: string) => void } = {},
): Promise<number> {
  const { cwd = process.cwd(), run = spawnRun, say = console.log } = o;
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) throw new Error("run it in a site's folder: there is no package.json here");
  const pkgText = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(pkgText);
  const spec = (pkg.dependencies?.duckdown ?? pkg.devDependencies?.duckdown) as string | undefined;   // either, as init takes
  const pin = spec?.match(PIN);
  if (!pin) {
    throw new Error(spec
      ? `duckdown is "${spec}" here, not a github:blueshed/duckdown#vX.Y.Z tag to move`
      : "duckdown isn't a dependency here — a site made by bun create owns its code, and has no upgrade (see the README)");
  }
  const from = pin[2]!;

  const to = args[0]?.replace(/^v/, "") || await newest(run, cwd);
  if (!/^\d+\.\d+\.\d+$/.test(to)) throw new Error(`"${args[0]}" isn't a version: say it as 0.12.3 or v0.12.3`);
  if (to === from) {
    say(`Already on v${from}.`);
    return 0;
  }

  const scratch = mkdtempSync(join(tmpdir(), "duckdown-upgrade-"));
  const exportTo = (out: string) => run(["bun", "run", join("node_modules", "duckdown", "server", "export.ts"), out], cwd);
  const lockPath = join(cwd, "bun.lock");
  const lockText = existsSync(lockPath) ? readFileSync(lockPath, "utf8") : null;
  try {
    const before = await exportTo(join(scratch, "before"));
    if (before.code !== 0) throw new Error(`the site doesn't export as it is, on v${from}, so there is nothing to compare with:\n${before.out.trim()}`);

    writeFileSync(pkgPath, pkgText.replace(`${pin[1]}#v${from}`, `${pin[1]}#v${to}`));
    const put = async (why: string) => {
      writeFileSync(pkgPath, pkgText);
      if (lockText !== null) writeFileSync(lockPath, lockText);
      await run(["bun", "install"], cwd);
      return new Error(`${why} — put back to v${from}`);
    };
    const installed = await run(["bun", "install"], cwd);
    const version = existsSync(join(cwd, "node_modules", "duckdown", "package.json"))
      ? JSON.parse(readFileSync(join(cwd, "node_modules", "duckdown", "package.json"), "utf8")).version
      : null;
    if (installed.code !== 0 || version !== to) {
      throw await put(`v${to} didn't install:\n${installed.out.trim()}`);
    }
    const after = await exportTo(join(scratch, "after"));
    if (after.code !== 0) throw await put(`v${to} can't export this site:\n${after.out.trim()}`);

    const skill = existsSync(join(cwd, SKILL));
    if (skill) cpSync(join(cwd, "node_modules", "duckdown", SKILL), join(cwd, SKILL), { recursive: true });

    const d = compare(join(scratch, "before"), join(scratch, "after"));
    say(`duckdown v${from} → v${to}${skill ? ", and the skill's copy refreshed" : ""}.`);
    const differs = d.added.length + d.removed.length + d.changed.length;
    say(differs
      ? `The export: ${d.same} file(s) the same, ${differs} not.`
      : `The export: all ${d.same} file(s) the same.`);
    for (const [what, list] of [["added", d.added], ["gone", d.removed], ["changed", d.changed]] as const) {
      for (const path of list) say(`  ${what}: ${path}`);
    }
    const changelog = join(cwd, "node_modules", "duckdown", "CHANGELOG.md");
    const notes = existsSync(changelog) ? changesBetween(readFileSync(changelog, "utf8"), from, to) : "";
    if (notes) say(`\n${notes}\n`);
    say("Nothing is committed: look it over, then commit package.json and bun.lock"
      + (skill ? ` and ${SKILL}` : "") + ".");
    return 0;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
