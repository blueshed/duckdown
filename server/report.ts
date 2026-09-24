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
// Nothing in it says who: the lines carry no address, browser or cookie.

const TOP = 20;

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
  const readers = views.filter((v) => !v.crawler);
  const read: Tally = new Map();
  const missing: Tally = new Map();
  const from: Tally = new Map();
  let errors = 0;
  for (const v of views) {
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
    `| Views by crawlers | ${number(views.length - readers.length)} |`,
    `| Not found (404) | ${number([...missing.values()].reduce((a, b) => a + b, 0))} |`,
    ...(errors ? [`| Server errors (5xx) | ${number(errors)} |`] : []),
    "",
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

// Reads the lines — from a file named on the command line, else what is piped
// in — writes reports/<yyyy-mm>/<yyyy-mm-dd>.md (today's is replaced by a
// second run today), and says where.
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
  const date = now.toISOString().slice(0, 10);
  const key = `${date.slice(0, 7)}/${date}.md`;
  const replacing = await store.exists(key);
  await store.write(key, reportMarkdown(views, now));
  say(`${replacing ? "replaced" : "wrote"} reports/${key}, from ${number(views.length)} view line(s)`);
  return 0;
}
