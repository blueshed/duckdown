#!/usr/bin/env bun

// bun run sites [root]: every site that runs duckdown, and where each stands
// against the newest tag — its pin, what is installed, its copy of the skill,
// whether git has the upgrade, and which duckdown its address's /health says
// it runs (from 0.14.4; an older one says only OK). It reads and changes
// nothing, and exits 0: what to do about a site that's behind is in that
// site's own CLAUDE.md. A release is out when every row is on the newest tag.
//
// The sites are found, not listed: a folder under root (two levels down,
// skipping archive/) whose package.json depends on github:blueshed/duckdown,
// or links a working copy of it (file:, shown as linked, never behind). Its
// address is the DUCKDOWN_ORIGIN its .railway/railway.ts declares first; when
// that isn't duckdown yet (a domain not moved to Railway), the service's own
// <service>-production.up.railway.app is asked instead, and the row says so.

import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join, relative } from "path";
import { compare, latestTag, spawnRun } from "../server/upgrade";

const ROOT = process.argv[2] ?? join(homedir(), "Workshop");
const REPO = "https://github.com/blueshed/duckdown.git";
const SKILL = join(".claude", "skills", "duckdown");
const SKIP = new Set(["node_modules", "archive"]);

type Row = { site: string; pin: string; installed: string; skill: string; git: string; live: string; origin: string; behind: string[] };

function folders(dir: string, depth: number): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];   // a folder we may not read holds no site we look after
  }
  return entries
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !SKIP.has(d.name))
    .flatMap((d) => {
      const path = join(dir, d.name);
      return depth > 1 ? [path, ...folders(path, depth - 1)] : [path];
    });
}

// The duckdown a folder depends on, when it is a site that does.
function spec(dir: string): string | null {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return null;
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  if (pkg.name === "duckdown") return null;
  const s = pkg.dependencies?.duckdown ?? pkg.devDependencies?.duckdown;
  return typeof s === "string" && (s.startsWith("github:blueshed/duckdown") || (s.startsWith("file:") && s.endsWith("/duckdown"))) ? s : null;
}

// What railway.ts declares: the site's address, and the service's name.
function railway(dir: string): { origin: string; service: string } {
  const path = join(dir, ".railway", "railway.ts");
  if (!existsSync(path)) return { origin: "", service: "" };
  const code = readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  return {
    origin: code.match(/DUCKDOWN_ORIGIN:\s*["'`]([^"'`]+)["'`]/)?.[1] ?? "",
    service: code.match(/service\(\s*["'`]([^"'`]+)["'`]/)?.[1] ?? "",
  };
}

async function live(at: string): Promise<string> {
  if (!at) return "—";
  try {
    const res = await fetch(`${at}/health`, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    const text = (await res.text()).trim();
    const v = text.match(/^OK duckdown (\d+\.\d+\.\d+)$/)?.[1];
    if (v) return v;
    if (text === "OK") return "OK, no version";
    return res.ok ? "not duckdown" : `answers ${res.status}`;
  } catch {
    return "no answer";
  }
}

async function git(dir: string): Promise<string> {
  const upgrade = await spawnRun(["git", "status", "--porcelain", "--", "package.json", "bun.lock", SKILL], dir);
  if (upgrade.code !== 0) return "not a repository";
  if (upgrade.out.trim()) return "upgrade not committed";
  const ahead = await spawnRun(["git", "rev-list", "--count", "@{u}..HEAD"], dir);
  const n = Number(ahead.out.trim());
  return ahead.code !== 0 ? "no upstream" : n ? `${n} unpushed` : "pushed";
}

async function row(dir: string, s: string, newest: string): Promise<Row> {
  const linked = s.startsWith("file:");
  const pin = linked ? "linked" : s.match(/#v(\d+\.\d+\.\d+)$/)?.[1] ?? "no tag";
  const pkg = join(dir, "node_modules", "duckdown", "package.json");
  const installed = existsSync(pkg) ? JSON.parse(readFileSync(pkg, "utf8")).version : "none";
  const theirs = join(dir, "node_modules", "duckdown", SKILL);
  const skill = !existsSync(join(dir, SKILL)) ? "none"
    : !existsSync(theirs) ? "?"
    : (({ added, removed, changed }) => added.length + removed.length + changed.length ? "differs" : "same")(compare(theirs, join(dir, SKILL)));
  const declared = railway(dir);
  let at = declared.origin;
  const [g, first] = await Promise.all([git(dir), live(at)]);
  let l = first;
  if (declared.service && (l === "not duckdown" || l === "no answer" || l === "—")) {
    const own = `https://${declared.service}-production.up.railway.app`;
    const there = await live(own);
    if (/^\d|^OK/.test(there)) [at, l] = [`${own} (${declared.origin ? `${declared.origin}: ${first}` : "no DUCKDOWN_ORIGIN"})`, there];
  }
  const behind = linked ? [] : [
    pin !== newest && "pin",
    installed !== newest && "installed",
    skill === "differs" && "skill",
    (g === "upgrade not committed" || g.endsWith("unpushed")) && "git",
    at ? l !== newest && "live" : "no address",
  ].filter((x): x is string => !!x);
  return { site: relative(ROOT, dir), pin, installed, skill, git: g, live: l, origin: at || "(no DUCKDOWN_ORIGIN)", behind };
}

const tags = await spawnRun(["git", "ls-remote", "--tags", "--refs", REPO], ROOT);
const newest = tags.code === 0 ? latestTag(tags.out) : null;
if (!newest) {
  console.error(`couldn't read duckdown's tags: ${tags.out.trim() || "none found"}`);
  process.exit(0);
}

const sites = folders(ROOT, 2).flatMap((dir) => {
  const s = spec(dir);
  return s ? [{ dir, s }] : [];
});
const rows = (await Promise.all(sites.map(({ dir, s }) => row(dir, s, newest)))).sort((a, b) => a.site.localeCompare(b.site));

const head: Record<keyof Omit<Row, "behind">, string> = {
  site: "site", pin: "pin", installed: "installed", skill: "skill", git: "git", live: "live", origin: "address",
};
const cols = Object.keys(head) as (keyof typeof head)[];
const width = Object.fromEntries(cols.map((c) => [c, Math.max(head[c].length, ...rows.map((r) => r[c].length))]));
const line = (r: typeof head) => cols.map((c) => r[c].padEnd(width[c]!)).join("  ").trimEnd();

console.log(`duckdown's newest tag is v${newest}. ${rows.length} site(s) under ${ROOT}:\n`);
console.log(line(head));
for (const r of rows) console.log(line(r));
const behind = rows.filter((r) => r.behind.length);
console.log(behind.length
  ? `\nNot yet on v${newest}: ${behind.map((r) => `${r.site} (${r.behind.join(", ")})`).join("; ")}.`
  : `\nEvery site is on v${newest}, live included.`);
