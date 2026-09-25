import type { Storage } from "./storage";
import { createReportStorage } from "./storage";
import { parseView, type View } from "./log";

// `duckdown report`: the view lines a site's server printed (DUCKDOWN_LOG=1)
// made into a page for its editors — what was read, what was asked for and
// wasn't there, and which sites sent readers. A published site's lines live
// only in its platform's log, so they are piped in on the machine that edits
// it (`railway logs | duckdown report`, or a saved log: `duckdown report
// railway.log`) and the report is written to that
// copy's reports/, where the editor's Reports tab shows it. duckdown asks the
// platform for nothing: fetching the lines stays with the platform's own tool.
//
// A report is of exactly the lines it was given: it keeps no count between
// runs, so running it twice over overlapping logs never counts a view twice.
// Each line lands in the report for its own day (UTC), so a week of log is
// seven reports, and a later run replaces the days it covers — give it whole
// days. Nothing in it says who: the lines carry no address, browser or cookie.

const TOP = 20;

// A request no page of a site like this answers, made by a scanner looking
// for a weakness: a dot-file or folder (/.env, /.git/config — not
// /.well-known/, a standard address worth knowing is missing), PHP,
// WordPress, a config, a backup. Scanners pose as browsers, so the log can't
// mark them as crawlers; on blueshed.co.uk's first report they were 939 of
// 993 views. The report counts them apart, and leaves them out of the readers
// and of Not found, which then says what a reader asked for and missed.
export const PROBES = [
  /(^|\/)(\.|%2e)(?!well-known\/)/i,                          // a dot-file or folder, spelled or encoded
  /%2f/i,                                                       // an encoded slash: a path trying to climb
  /\.php\b|phpinfo|phpmyadmin|opcache/i,                        // PHP
  /\/(wp-|cgi-bin\b|_profiler\b|actuator\b|_environment\b|server-status\b|debug\/)/i,   // other stacks' insides
  /^\/(api|_[^/]*|@[^/]*)(\/|$)/i,                             // an API, or a framework's own: this site has neither
  /(^|\/)(env|credentials?|secrets?|dockerfile|pipfile|cakefile|id_rsa|appsettings[^/]*|settings\.json|auth\.json|composer\.(json|lock))$/i,
  /(^|\/)env[-_.]/i,                                            // env.js, env-config.js, env.txt
  /\.(bak|backup|old|orig|sql|zip|tar|gz|rar|7z|ini|ya?ml|conf|swp|env|properties|secret)$/i,   // configs, backups, secrets
  // Scripts, data, source and keys: a site's own are in static/, and it
  // serves no source at all. search.json, sitemap.xml and feeds are its own.
  /^(?!\/static\/)(?!\/search\.json$).*\.(js|json|ts|rb|py|toml|tfstate|tfvars|key|pem|csv|log|pwd|lock)$/i,
  /^(?!\/static\/)(?!.*\/(sitemap|feed)\.xml$).*\.xml$/i,
];
// A file a page pulls in — a picture, a stylesheet, the search index, a feed —
// not a page anyone read: counted apart, and kept out of the views and Most
// read. (A missing one is still Not found: a 404 favicon is worth knowing.)
const FILE = /^\/static\/|^\/(favicon\.ico|robots\.txt|apple-touch-icon[^/]*\.png|search\.json|sitemap\.xml)$|\/feed\.xml$/i;

// A machine that isn't a crawler by its name: a certificate authority checking
// the site is the site (ACME), which on a domain's first day asks hundreds of
// times. A crawler's view, and not something missing that wants a page.
const ACME = /^\/\.well-known\/acme-challenge\//;

export const isProbe = (path: string) => {
  const p = path.split("?")[0]!;
  return PROBES.some((probe) => probe.test(p));
};

type Tally = Map<string, number>;
const count = (tally: Tally, key: string) => tally.set(key, (tally.get(key) ?? 0) + 1);
const top = (tally: Tally, n = TOP) => [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
const cell = (text: string) => text.replace(/\|/g, "\\|");
const number = (n: number) => n.toLocaleString("en-GB");
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function table(heading: string, rows: [string, number][], empty: string): string {
  if (!rows.length) return `${empty}\n`;
  return `| ${heading} | Views |\n|---|---:|\n${rows.map(([k, v]) => `| ${cell(k)} | ${number(v)} |`).join("\n")}\n`;
}

// A day's counts, whole: what its report says, kept beside it as <day>.json
// so a month's page is made from its days, keeping no count of its own.
export type Counts = {
  lines: number; readers: number; crawlers: number; missing: number; errors: number; files: number; probes: number;
  read: Record<string, number>; notFound: Record<string, number>; from: Record<string, number>;
};

export function countViews(views: View[]): Counts {
  const asked = views.filter((v) => !isProbe(v.path));
  const pages = asked.filter((v) => !FILE.test(v.path.split("?")[0]!));
  const readers = pages.filter((v) => !v.crawler && !ACME.test(v.path));
  const read: Tally = new Map();
  const missing: Tally = new Map();
  const from: Tally = new Map();
  let errors = 0;
  for (const v of asked) {
    if (v.status === 404 && !ACME.test(v.path)) count(missing, v.path);   // a certificate check isn't worth a page
    if (v.status >= 500) errors++;
  }
  for (const v of readers) {
    if (v.status < 400) count(read, v.path);
    if (v.from) count(from, v.from);
  }
  return {
    lines: views.length, readers: readers.length, crawlers: pages.length - readers.length,
    missing: [...missing.values()].reduce((a, b) => a + b, 0), errors,
    files: asked.length - pages.length, probes: views.length - asked.length,
    read: Object.fromEntries(read), notFound: Object.fromEntries(missing), from: Object.fromEntries(from),
  };
}

// The totals and the three tables, as a day's page and a month's both show them.
function body(c: Counts): string[] {
  const tally = (o: Record<string, number>): Tally => new Map(Object.entries(o));
  return [
    "| In the log | Count |",
    "|---|---:|",
    `| Views by readers | ${number(c.readers)} |`,
    `| Views by crawlers | ${number(c.crawlers)} |`,
    `| Not found (404) | ${number(c.missing)} |`,
    ...(c.errors ? [`| Server errors (5xx) | ${number(c.errors)} |`] : []),
    ...(c.files ? [`| Files a page pulled in | ${number(c.files)} |`] : []),
    ...(c.probes ? [`| Probes by scanners | ${number(c.probes)} |`] : []),
    "",
    ...(c.probes ? [
      `${number(c.probes)} request(s) were probes: a scanner asking for files no site like this has (\`.env\`, \`.git\`, \`.php\`…).`,
      "They're counted here and left out of everything else.",
      "",
    ] : []),
    "## Most read",
    "",
    table("Page", top(tally(c.read)), "No page was read by a reader."),
    "## Not found",
    "",
    "Addresses asked for that aren't there — worth a page, or an `aliases:` line on the page they meant.",
    "",
    table("Address", top(tally(c.notFound)), "Nothing was missing."),
    "## Where readers came from",
    "",
    table("Site", top(tally(c.from)), "No reader followed a link from another site."),
  ];
}

export function reportMarkdown(views: View[], now: Date): string {
  const stamps = views.map((v) => v.at).filter(Boolean).sort();
  const span = stamps.length ? `, from ${stamps[0]} to ${stamps.at(-1)}` : "";
  return [
    `title: Visitors, ${day.format(now)}`,
    "",
    `# Visitors, ${day.format(now)}`,
    "",
    `Made by \`duckdown report\` from ${number(views.length)} view line(s)${span} — exactly the lines it was given, so it`,
    "counts nothing twice. No reader is identified: the log records no address, browser or cookie.",
    "",
    ...body(countViews(views)),
  ].join("\n");
}

const month = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const short = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

// A month's page: each day's line, linked to its report, then the month's
// totals and tables, summed from the days' own counts.
export function monthMarkdown(yyyymm: string, days: [string, Counts][]): string {
  const sorted = [...days].sort(([a], [b]) => a.localeCompare(b));
  const sum = (key: keyof Counts) => sorted.reduce((n, [, c]) => n + (c[key] as number), 0);
  const merge = (key: "read" | "notFound" | "from") => {
    const all: Record<string, number> = {};
    for (const [, c] of sorted) for (const [k, v] of Object.entries(c[key])) all[k] = (all[k] ?? 0) + v;
    return all;
  };
  const total: Counts = {
    lines: sum("lines"), readers: sum("readers"), crawlers: sum("crawlers"), missing: sum("missing"),
    errors: sum("errors"), files: sum("files"), probes: sum("probes"),
    read: merge("read"), notFound: merge("notFound"), from: merge("from"),
  };
  return [
    `title: Visitors, ${month.format(noon(`${yyyymm}-01`))}`,
    "",
    `# Visitors, ${month.format(noon(`${yyyymm}-01`))}`,
    "",
    `The month so far, from the reports of ${number(sorted.length)} day(s); each day's report has its own detail.`,
    "",
    "| Day | Readers | Crawlers | Not found | Probes |",
    "|---|---:|---:|---:|---:|",
    ...sorted.map(([date, c]) =>
      `| [${short.format(noon(date))}](${date}.md) | ${number(c.readers)} | ${number(c.crawlers)} | ${number(c.missing)} | ${number(c.probes)} |`),
    "",
    ...body(total),
  ].join("\n");
}

// The UTC day a line was printed on, from its timestamp: a platform's may say
// nanoseconds, which a Date can't read, or put a space for the T. Null when
// there is none to read.
export function dayOf(at: string): string | null {
  const when = new Date(at.replace(" ", "T").replace(/(\.\d{3})\d+/, "$1"));
  return at && !Number.isNaN(when.getTime()) ? when.toISOString().slice(0, 10) : null;
}

// Reads the lines — from a file named on the command line, else what is piped
// in — writes reports/<yyyy-mm>/<yyyy-mm-dd>.md for each day they cover
// (a line with no time counts as today's; a day already reported is
// replaced), and says where.
export async function reportCommand(
  args: string[],
  read = (file?: string) => (file ? Bun.file(file).text() : Bun.stdin.text()),
  store: Storage = createReportStorage(),
  now = new Date(),
  say: (line: string) => void = console.log,
): Promise<number> {
  const views = (await read(args[0])).split(/\r?\n/).map(parseView).filter((v): v is View => v !== null);
  if (!views.length) {
    throw new Error("No view lines in what was read: pipe in the site's log, and check DUCKDOWN_LOG=1 is set where it runs");
  }
  const today = now.toISOString().slice(0, 10);
  const days = new Map<string, View[]>();
  for (const v of views) {
    const date = dayOf(v.at) ?? today;
    days.set(date, [...(days.get(date) ?? []), v]);
  }
  const months = new Set<string>();
  for (const [date, lines] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    const key = `${date.slice(0, 7)}/${date}.md`;
    const replacing = await store.exists(key);
    await store.write(key, reportMarkdown(lines, noon(date)));
    await store.write(key.replace(/\.md$/, ".json"), JSON.stringify(countViews(lines)));
    say(`${replacing ? "replaced" : "wrote"} reports/${key}, from ${number(lines.length)} view line(s)`);
    months.add(date.slice(0, 7));
  }
  // Each month touched, made again from every day it has counts for.
  for (const yyyymm of months) {
    const { files } = await store.list(yyyymm);
    const counted: [string, Counts][] = [];
    for (const f of files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f.name))) {
      counted.push([f.name.slice(0, 10), JSON.parse(await store.read(f.path)) as Counts]);
    }
    await store.write(`${yyyymm}/index.md`, monthMarkdown(yyyymm, counted));
    say(`wrote reports/${yyyymm}/index.md, from ${number(counted.length)} day(s)`);
  }
  return 0;
}
