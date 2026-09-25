// n117: the view log read back, and made into a report for the editors.
import { describe, test, expect, spyOn } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { RUN, SITE } from "./helpers";
import { viewLine, parseView } from "../server/log";
import { reportMarkdown, reportCommand, isProbe, dayOf, monthMarkdown, countViews } from "../server/report";
import { LocalStorage } from "../server/storage";
import { cli } from "../server/cli";

const NOW = new Date("2026-09-24T12:00:00Z");

describe("parseView", () => {
  test("reads back what viewLine writes, whatever the platform put before it", () => {
    expect(parseView(viewLine("/blog/", 200, 12.4, "news.example.com", "Mozilla"))).toEqual(
      { path: "/blog/", status: 200, ms: 12, from: "news.example.com", crawler: false, at: "" });
    expect(parseView(`2026-09-23T10:00:01.123Z ${viewLine("/", 404, 3, "", "Googlebot")}`)).toEqual(
      { path: "/", status: 404, ms: 3, from: "", crawler: true, at: "2026-09-23T10:00:01.123Z" });
    expect(parseView(`[2026-09-23 10:00:01+01:00] web ${viewLine("/a", 304, 1, "", "")}`)!.at).toBe("2026-09-23 10:00:01+01:00");
  });

  test("a JSON line's message and timestamp; anything else is not a view", () => {
    expect(parseView(JSON.stringify({ message: "view /about.html 200 5ms", timestamp: "2026-09-23T09:00:00Z", severity: "info" }))).toEqual(
      { path: "/about.html", status: 200, ms: 5, from: "", crawler: false, at: "2026-09-23T09:00:00Z" });
    expect(parseView(JSON.stringify({ message: "view /x 200 5ms" }))!.at).toBe("");
    expect(parseView(JSON.stringify({ message: "listening on 8080" }))).toBeNull();
    expect(parseView(JSON.stringify({ msg: 7 }))).toBeNull();
    expect(parseView("{ not json")).toBeNull();
    expect(parseView("  storage: /srv/site")).toBeNull();
    expect(parseView("preview /x 200 5ms")).toBeNull();                // "view" as a word, not inside one
  });
});

describe("the report", () => {
  const views = [
    "2026-09-01T08:00:00Z view / 200 4ms",
    "2026-09-02T08:00:00Z view / 200 4ms from=news.example.com",
    "2026-09-03T08:00:00Z view /blog/ 304 2ms from=news.example.com",
    "2026-09-04T08:00:00Z view /a|b.html 200 2ms from=friend.example.org",
    "2026-09-05T08:00:00Z view /old-page 404 1ms",
    "2026-09-06T08:00:00Z view /old-page 404 1ms crawler",
    "2026-09-07T08:00:00Z view / 200 9ms crawler",
    "2026-09-08T08:00:00Z view /boom 500 1ms",
  ].map((l) => parseView(l)!);

  test("readers and crawlers apart, what was read, what was missing, who sent readers", () => {
    const md = reportMarkdown(views, NOW);
    expect(md).toStartWith("title: Visitors, 24 September 2026\n\n# Visitors, 24 September 2026\n");
    expect(md).toContain("from 8 view line(s), from 2026-09-01T08:00:00Z to 2026-09-08T08:00:00Z — exactly the lines it was given");
    expect(md).toContain("| Views by readers | 6 |");
    expect(md).toContain("| Views by crawlers | 2 |");
    expect(md).toContain("| Not found (404) | 2 |");
    expect(md).toContain("| Server errors (5xx) | 1 |");
    expect(md).toContain("| Page | Views |\n|---|---:|\n| / | 2 |\n| /a\\|b.html | 1 |\n| /blog/ | 1 |");
    expect(md).toContain("| Address | Views |\n|---|---:|\n| /old-page | 2 |");
    expect(md).toContain("| news.example.com | 2 |\n| friend.example.org | 1 |");
    expect(md).not.toMatch(/Mozilla|Googlebot|\d+\.\d+\.\d+\.\d+/);    // nothing about who
  });

  test("a scanner's probes are counted apart, and kept out of readers and of Not found", () => {
    const md = reportMarkdown([
      "view / 200 3ms", "view /.env 404 1ms", "view /wp-login.php 404 1ms", "view /.git/config 404 1ms",
      "view /appsettings.Production.json 404 1ms", "view /old-page 404 1ms",
    ].map((l) => parseView(l)!), NOW);
    expect(md).toContain("| Views by readers | 2 |");                // / and /old-page
    expect(md).toContain("| Not found (404) | 1 |");
    expect(md).toContain("| Probes by scanners | 4 |");
    expect(md).toContain("4 request(s) were probes: a scanner asking for files no site like this has");
    expect(md).toContain("| Address | Views |\n|---|---:|\n| /old-page | 1 |\n");
    expect(md).not.toContain("/.env |");
    expect(reportMarkdown([parseView("view / 200 1ms")!], NOW)).not.toContain("Probes");
  });

  test("files a page pulls in and certificate checks aren't readers' views; a missing file is still missing", () => {
    const md = reportMarkdown([
      "view / 200 3ms", "view /static/site.css 200 1ms", "view /static/images/a.jpg 200 1ms", "view /search.json 200 1ms",
      "view /favicon.ico 404 1ms", "view /blog/feed.xml 200 1ms",
      "view /.well-known/acme-challenge/verify 404 0ms", "view /.well-known/acme-challenge/verify 404 0ms",
    ].map((l) => parseView(l)!), NOW);
    expect(md).toContain("| Views by readers | 1 |");
    expect(md).toContain("| Views by crawlers | 2 |");                  // the certificate authority, twice
    expect(md).toContain("| Files a page pulled in | 5 |");
    expect(md).toContain("| Page | Views |\n|---|---:|\n| / | 1 |\n");  // no stylesheet among what was read
    expect(md).toContain("| /favicon.ico | 1 |");
    expect(md).toContain("| Not found (404) | 1 |");                    // the favicon, not the certificate checks
    expect(md).not.toContain("acme-challenge |");
  });

  test("what counts as a probe, and what a site of this kind really serves", () => {
    for (const path of ["/.env", "/%2eenv", "/%2f%2eaws%2fcredentials", "/.git/config", "/phpinfo", "/wp-admin/", "/xmlrpc.php?x=1",
      "/cgi-bin/luci", "/actuator/health", "/server-status", "/debug/vars", "/credentials", "/Dockerfile", "/env.js",
      "/config.yml", "/backup.sql", "/terraform.tfstate.backup", "/s3.secret", "/app.js", "/appsettings.QA.json", "/settings.py",
      "/id_rsa", "/phpcs.xml", "/storage/logs/laravel.log", "/api", "/api/v1/config", "/@fs/proc/self/environ",
      "/_ignition/health-check", "/_image"]) expect([path, isProbe(path)]).toEqual([path, true]);
    for (const path of ["/", "/about.html", "/blog/", "/why-i-left-php-behind.html", "/static/site.css", "/static/search.js",
      "/static/data/prices.csv", "/search.json", "/sitemap.xml", "/blog/feed.xml", "/.well-known/security.txt", "/robots.txt",
      "/favicon.ico", "/feed/", "/llms.txt", "/edit", "/apiary.html", "/blog/api/"]) expect([path, isProbe(path)]).toEqual([path, false]);
  });

  test("a line's day is its own, read from whatever the platform wrote", () => {
    expect(dayOf("2026-09-25T14:25:39.745618764Z")).toBe("2026-09-25");     // Railway: nanoseconds
    expect(dayOf("2026-09-24 23:30:00+00:00")).toBe("2026-09-24");
    expect(dayOf("2026-09-25T00:30:00+01:00")).toBe("2026-09-24");          // a day is UTC's
    expect(dayOf("")).toBeNull();
    expect(dayOf("yesterday")).toBeNull();
  });

  test("says so when there's nothing to put in a table, and no span without timestamps", () => {
    const md = reportMarkdown([parseView("view /gone 404 1ms crawler")!], NOW);
    expect(md).toContain("No page was read by a reader.");
    expect(md).toContain("No reader followed a link from another site.");
    expect(md).toContain("from 1 view line(s) — exactly");
    expect(md).not.toContain("Server errors");
    expect(reportMarkdown([parseView("view / 200 1ms")!], NOW)).toContain("Nothing was missing.");
  });

  test("duckdown report: written to reports/<month>/<day>.md, replaced by a second run that day", async () => {
    const root = mkdtempSync(join(RUN, "reports-"));
    const store = new LocalStorage(root);
    const said: string[] = [];
    const log = "duckie\n  storage: /srv\nview / 200 3ms\nview /blog/ 200 2ms\n";
    expect(await reportCommand([], async () => log, store, NOW, (l) => said.push(l))).toBe(0);
    expect(readFileSync(join(root, "2026-09/2026-09-24.md"), "utf8")).toContain("| Views by readers | 2 |");
    expect(await reportCommand([], async () => "view / 200 3ms\r\n", store, NOW, (l) => said.push(l))).toBe(0);
    expect(said).toEqual([
      "wrote reports/2026-09/2026-09-24.md, from 2 view line(s)", "wrote reports/2026-09/index.md, from 1 day(s)",
      "replaced reports/2026-09/2026-09-24.md, from 1 view line(s)", "wrote reports/2026-09/index.md, from 1 day(s)",
    ]);
    await expect(reportCommand([], async () => "listening\n", store, NOW)).rejects.toThrow(
      "No view lines in what was read: pipe in the site's log, and check DUCKDOWN_LOG=1 is set where it runs");
  });

  test("a log that spans days is a report for each, and a line with no time is today's", async () => {
    const root = mkdtempSync(join(RUN, "reports-days-"));
    const store = new LocalStorage(root);
    const said: string[] = [];
    const log = [
      JSON.stringify({ message: "view / 200 3ms", timestamp: "2026-09-23T23:59:59.999999999Z" }),
      JSON.stringify({ message: "view /blog/ 200 3ms", timestamp: "2026-09-22T08:00:00Z" }),
      JSON.stringify({ message: "view /a.html 200 3ms", timestamp: "2026-09-23T00:00:00Z" }),
      "view /untimed.html 200 3ms",
    ].join("\n");
    expect(await reportCommand([], async () => log, store, NOW, (l) => said.push(l))).toBe(0);
    expect(said).toEqual([
      "wrote reports/2026-09/2026-09-22.md, from 1 view line(s)",
      "wrote reports/2026-09/2026-09-23.md, from 2 view line(s)",
      "wrote reports/2026-09/2026-09-24.md, from 1 view line(s)",
      "wrote reports/2026-09/index.md, from 3 day(s)",
    ]);
    const day = readFileSync(join(root, "2026-09/2026-09-23.md"), "utf8");
    expect(day).toStartWith("title: Visitors, 23 September 2026\n");
    expect(day).toContain("| Views by readers | 2 |");
    expect(readFileSync(join(root, "2026-09/2026-09-24.md"), "utf8")).toContain("/untimed.html");
  });

  test("a month's page: its days, linked, and their sums; a day reported again isn't counted twice", async () => {
    const root = mkdtempSync(join(RUN, "reports-month-"));
    const store = new LocalStorage(root);
    const said: string[] = [];
    const line = (path: string, at: string, extra = "") => JSON.stringify({ message: `view ${path} 200 3ms${extra}`, timestamp: at });
    await reportCommand([], async () => [
      line("/", "2026-09-20T10:00:00Z"), line("/a.html", "2026-09-20T11:00:00Z", " from=news.example.com"),
      line("/", "2026-09-21T10:00:00Z"), JSON.stringify({ message: "view /.env 404 1ms", timestamp: "2026-09-21T10:00:00Z" }),
      line("/", "2026-10-01T10:00:00Z"),
    ].join("\n"), store, NOW, (l) => said.push(l));
    expect(said.filter((l) => l.includes("index.md"))).toEqual([
      "wrote reports/2026-09/index.md, from 2 day(s)", "wrote reports/2026-10/index.md, from 1 day(s)"]);
    const month = () => readFileSync(join(root, "2026-09/index.md"), "utf8");
    expect(month()).toStartWith("title: Visitors, September 2026\n\n# Visitors, September 2026\n");
    expect(month()).toContain("| [20 September](2026-09-20.md) | 2 | 0 | 0 | 0 |");
    expect(month()).toContain("| [21 September](2026-09-21.md) | 1 | 0 | 0 | 1 |");
    expect(month()).toContain("| Views by readers | 3 |");
    expect(month()).toContain("| Probes by scanners | 1 |");
    expect(month()).toContain("| / | 2 |");
    expect(month()).toContain("| news.example.com | 1 |");
    // The 21st again, with more of its day: replaced, and the month with it — never added to.
    await reportCommand([], async () => [line("/", "2026-09-21T10:00:00Z"), line("/b.html", "2026-09-21T12:00:00Z")].join("\n"), store, NOW, () => {});
    expect(month()).toContain("| [21 September](2026-09-21.md) | 2 | 0 | 0 | 0 |");
    expect(month()).toContain("| Views by readers | 4 |");
    expect(JSON.parse(readFileSync(join(root, "2026-09/2026-09-21.json"), "utf8"))).toEqual(countViews(
      [line("/", "2026-09-21T10:00:00Z"), line("/b.html", "2026-09-21T12:00:00Z")].map((l) => parseView(l)!)));
    expect(monthMarkdown("2026-02", [])).toContain("from the reports of 0 day(s)");
  });

  test("is a duckdown command, reading a saved log into this site's reports/", async () => {
    const file = join(mkdtempSync(join(RUN, "log-")), "railway.log");
    writeFileSync(file, "view / 200 3ms\n");
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await cli(["report", file])).toBe(0);
      const today = new Date().toISOString().slice(0, 10);
      expect(existsSync(join(SITE, "reports", today.slice(0, 7), `${today}.md`))).toBe(true);
      expect(log.mock.calls[0]![0]).toMatch(/^wrote reports\//);
    } finally {
      log.mockRestore();
      rmSync(join(SITE, "reports"), { recursive: true, force: true });
    }
  });
});
