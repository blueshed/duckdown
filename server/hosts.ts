// Which name a request came in under, and what that name is for. One site has
// one address (DUCKDOWN_ORIGIN): the other names it answers to either move
// there or are places to look at it. Both servers ask the same questions —
// serve.ts for a published site, routes/site.ts for a served one — so the
// answers are written once, here.

// The name the reader asked for. Behind Railway's proxy that is
// x-forwarded-host; the Host header is what the proxy said to us.
export function hostOf(req: Request): string {
  return req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
}

// A host to look at the site on, never to publish it at: a local run, or the
// address the platform gives every service. Served whatever DUCKDOWN_ORIGIN
// says — a site deployed before its domain exists can still be seen — and
// marked noindex, so nothing is ever indexed under the wrong name. Unless it
// IS the name: a site whose origin is its railway.app address (no domain yet)
// is published there, and hiding it would contradict its own sitemap. The
// hostname is compared whole — localhost.example.com is somebody's site.
export function looking(host: string, origin = ""): boolean {
  if (origin && host === new URL(origin).host) return false;
  const name = host.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || /\.up\.railway\.app$/.test(name);
}

// The origin to move to when the request came in under another host, or
// null when it should be served here: no origin configured, the host matches,
// or it's one to look at the site on.
export function otherHost(host: string, origin: string): string | null {
  if (!origin) return null;
  const target = new URL(origin);
  if (host === target.host || looking(host)) return null;
  return target.origin;
}

// A place to look closes its robots.txt, whatever the site's own says.
export const CLOSED_ROBOTS = "User-agent: *\nDisallow: /\n";

// What a request gets before the site is asked at all: a closed robots.txt on
// a place to look, or a 301 to the origin, path and query kept, when it came
// in under another name (the apex when the origin is www). Absolute,
// deliberately — the point is to leave this host. Null: carry on.
export function hostAnswer(req: Request, origin: string): Response | null {
  const url = new URL(req.url);
  const host = hostOf(req);
  if (looking(host, origin) && url.pathname === "/robots.txt") {
    return new Response(CLOSED_ROBOTS, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const elsewhere = otherHost(host, origin);
  if (elsewhere) return new Response(null, { status: 301, headers: { Location: `${elsewhere}${url.pathname}${url.search}` } });
  return null;
}
