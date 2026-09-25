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
  /(^|\/)(env|credentials?|secrets?|dockerfile|pipfile|cakefile|id_rsa|appsettings[^/]*|settings\.json|auth\.json|composer\.(json|lock))$/i,
  /(^|\/)env[-_.]/i,                                            // env.js, env-config.js, env.txt
  /\.(bak|backup|old|orig|sql|zip|tar|gz|rar|7z|ini|ya?ml|conf|swp|env|properties|secret)$/i,   // configs, backups, secrets
  // Scripts, data, source and keys: a site's own are in static/, and it
  // serves no source at all. search.json, sitemap.xml and feeds are its own.
  /^(?!\/static\/)(?!\/search\.json$).*\.(js|json|ts|rb|py|toml|tfstate|tfvars|key|pem|csv|log|pwd|lock)$/i,
  /^(?!\/static\/)(?!.*\/(sitemap|feed)\.xml$).*\.xml$/i,
];
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

export function reportMarkdown(views: View[], now: Date): string {
  const probes = views.filter((v) => isProbe(v.path)).length;
  const asked = views.filter((v) => !isProbe(v.path));
  const readers = asked.filter((v) => !v.crawler);
  const read: Tally = new Map();
  const missing: Tally = new Map();
  const from: Tally = new Map();
  let errors = 0;
  for (const v of asked) {
    if (v.status === 404) count(missing, v.path);
    if (v.status >= 500) errors++;
  }
  for (const v of readers) {
    if (v.status < 400) count(read, v.path);
    if (v.from) count(from, v.from);
  }
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
    "| | |",
    "|---|---:|",
    `| Views by readers | ${number(readers.length)} |`,
    `| Views by crawlers | ${number(asked.length - readers.length)} |`,
    `| Not found (404) | ${number([...missing.values()].reduce((a, b) => a + b, 0))} |`,
    ...(errors ? [`| Server errors (5xx) | ${number(errors)} |`] : []),
    ...(probes ? [`| Probes by scanners | ${number(probes)} |`] : []),
    "",
    ...(probes ? [
      `${number(probes)} request(s) were probes: a scanner asking for files no site like this has (\`.env\`, \`.git\`, \`.php\`…).`,
      "They're counted here and left out of everything else.",
      "",
    ] : []),
    "## Most read",
    "",
    table("Page", top(read), "No page was read by a reader."),
    "## Not found",
    "",
    "Addresses asked for that aren't there — worth a page, or an `aliases:` line on the page they meant.",
    "",
    table("Address", top(missing), "Nothing was missing."),
    "## Where readers came from",
    "",
    table("Site", top(from), "No reader followed a link from another site."),
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
  for (const [date, lines] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    const key = `${date.slice(0, 7)}/${date}.md`;
    const replacing = await store.exists(key);
    await store.write(key, reportMarkdown(lines, new Date(`${date}T12:00:00Z`)));
    say(`${replacing ? "replaced" : "wrote"} reports/${key}, from ${number(lines.length)} view line(s)`);
  }
  return 0;
}
