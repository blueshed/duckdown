import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { createReportStorage } from "../storage";
import { renderMarkdown } from "../markdown";
import { plainKey } from "../history";
import { after, escapeHtml } from "../utils";
import { asFile } from "../headers";

const reports = createReportStorage();

// A report is read on the editor's own address, and holds what strangers
// asked for (the paths nobody found, the sites that sent readers): its page
// runs no script, so not even a javascript: link a report written before
// cell() escaped its paths could hold (report.ts).
const REPORT_POLICY = "script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

// reports/ is where a site's own tasks leave what they found (a usage report a
// month, an error when one failed) for the people who edit it. It is written
// by those tasks, not by the editor, so this is read-only: a folder is its
// listing, and a markdown file is a page of its own, rendered, for a browser
// tab — the editor lists them under Resources and opens them there. Only a
// signed-in editor reads them; nothing here is served, exported or seeded.
export const handleReports = {
  async GET(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const key = after(req, "/edit/reports/").replace(/\/$/, "");
    if (key && !plainKey(key)) return new Response("Not a report", { status: 400 });

    if (key && (await reports.exists(key))) {
      const source = await reports.read(key);
      // The markdown itself (?raw), or a file that isn't markdown — what an
      // extension collects lands here too — is handed out as it is: as a
      // file, never a page (headers.ts).
      if (!key.endsWith(".md") || new URL(req.url).searchParams.has("raw")) {
        const type = reports.mime(key);
        return new Response(source, { headers: { "Content-Type": type, "Cache-Control": "private, no-cache", ...asFile(type) } });
      }
      return new Response(reportPage(key, source), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-cache", "Content-Security-Policy": REPORT_POLICY },
      });
    }
    return Response.json(await reports.list(key));
  },
};

export function reportPage(key: string, source: string): string {
  const { content, meta } = renderMarkdown(source);
  const title = escapeHtml(meta.title?.[0] ?? key);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${title}</title>
  <link rel="stylesheet" href="/static/site.css">
  <style>main { max-width: 60rem; margin: 0 auto; padding: 1rem; } table { display: block; overflow-x: auto; }</style>
</head>
<body>
  <main>
    <p><small>reports/${escapeHtml(key)}</small></p>
    ${content}
  </main>
</body>
</html>
`;
}
