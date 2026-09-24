// n117: the view log read back, and made into a report for the editors.
import { describe, test, expect, spyOn } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { RUN, SITE } from "./helpers";
import { viewLine, parseView } from "../server/log";
import { reportMarkdown, reportCommand } from "../server/report";
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
    expect(said).toEqual(["wrote reports/2026-09/2026-09-24.md, from 2 view line(s)", "replaced reports/2026-09/2026-09-24.md, from 1 view line(s)"]);
    await expect(reportCommand([], async () => "listening\n", store, NOW)).rejects.toThrow(
      "No view lines in what was read: pipe in the site's log, and check DUCKDOWN_LOG=1 is set where it runs");
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
