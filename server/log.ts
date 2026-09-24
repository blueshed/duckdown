import { LOG_VIEWS } from "./config";

// Crawlers mostly say so. This is deliberately coarse: it separates the
// traffic that reads from the traffic that indexes, so a count means
// something. It will never be exactly right, and doesn't need to be.
const CRAWLER = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|monitor|curl|wget|python-requests|headless/i;

// The referring site, when it is a different one. A same-site referrer is
// just someone following a link through the site, which the paths already
// show — and only the host is kept, never the full URL, because a search
// referrer carries what was typed into it.
export function fromSite(referrer: string, here: string): string {
  try {
    const host = new URL(referrer).host;
    return host && host !== here ? host : "";
  } catch {
    return ""; // no referrer, or one that isn't a URL
  }
}

// One line per page view. No address, no user agent, no cookie, no session,
// nothing joinable: enough to see what is read and roughly how much, and
// nothing that says who read it. That is the whole point.
export function viewLine(path: string, status: number, ms: number, from: string, agent: string): string {
  return [
    "view", path, status, `${Math.round(ms)}ms`,
    from && `from=${from}`,
    CRAWLER.test(agent) && "crawler",
  ].filter(Boolean).join(" ");
}

export function logView(req: Request, status: number, startedAt: number, on = LOG_VIEWS): void {
  if (!on) return;
  const url = new URL(req.url);
  const here = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  console.log(viewLine(
    url.pathname,
    status,
    performance.now() - startedAt,
    fromSite(req.headers.get("referer") ?? "", here),
    req.headers.get("user-agent") ?? "",
  ));
}

// A view line read back, by `duckdown report`: from the platform's log as it
// prints it (anything before "view" — a timestamp, a service name — is
// allowed), or as a JSON line with a `message` and a `timestamp`. `at` is
// the timestamp when the line carries one. Anything else is not a view line.
export type View = { path: string; status: number; ms: number; from: string; crawler: boolean; at: string };

const VIEW = /(?:^|\s)view (\S+) (\d{3}) (\d+)ms(?: from=(\S+))?( crawler)?\s*$/;
const STAMP = /^\s*\[?(\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d\d:?\d\d)?)/;

export function parseView(line: string): View | null {
  let text = line;
  let at = "";
  if (line.trimStart().startsWith("{")) {
    try {
      const said = JSON.parse(line) as { message?: unknown; timestamp?: unknown };
      text = typeof said.message === "string" ? said.message : "";
      at = typeof said.timestamp === "string" ? said.timestamp : "";
    } catch {
      return null;   // not JSON after all, so not a line this wrote
    }
  }
  const m = text.match(VIEW);
  if (!m) return null;
  return {
    path: m[1]!, status: Number(m[2]), ms: Number(m[3]), from: m[4] ?? "", crawler: Boolean(m[5]),
    at: at || (text.match(STAMP)?.[1] ?? ""),
  };
}
