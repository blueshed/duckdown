import type { BunRequest } from "bun";

// A request that can't be answered because of what it says, not because of
// anything we did: handleError turns it into a 400 and doesn't log a stack.
export class BadRequest extends Error {
  constructor(message: string) {   // written out: an implicit constructor is a function coverage counts and never sees
    super(message);
  }
}

// A URL path with its %-escapes undone, or null when they are malformed
// ("/%E0%A4%A"). Scanners send these all day; none of them is a bug.
export function decodePath(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch {
    return null; // a malformed escape is the answer, not a failure to report
  }
}

// Extract the wildcard path from the URL by stripping the route prefix, and
// decode it: storage keys are real names ("About us.md", not "About%20us.md").
export function after(req: BunRequest, prefix: string): string {
  const path = decodePath(new URL(req.url).pathname.slice(prefix.length));
  if (path === null) throw new BadRequest("Bad Request");
  return path;
}

// Answer with validators, so a browser that has the bytes already is told so
// (304) instead of being sent them again. The tag is a hash of the bytes.
export function conditional(req: Request, body: string | Uint8Array, headers: Record<string, string>): Response {
  const etag = `"${Bun.hash(body).toString(36)}"`;
  const all = { ...headers, ETag: etag };
  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: all });
  return new Response(typeof body === "string" ? body : Buffer.from(body), { headers: all });
}

// Text on its way into HTML: a title, a description, an attribute's value.
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Apply `fn` to the parts of rendered HTML that lie outside <code>, so a page
// can show a tag rather than have it expand: a fence renders as <pre><code>,
// a span as <code>, and the guide needs to print {{pages}} in both.
export function outsideCode(html: string, fn: (part: string) => string): string {
  return html
    .split(/(<code[^>]*>[\s\S]*?<\/code>)/)
    .map((part, i) => (i % 2 ? part : fn(part)))
    .join("");
}

// Where a page lives, in one form. Three addresses reach the same page —
// /blog, /blog/ and /blog/index.html — so one of them has to be the name it
// goes by: the links we emit and the canonical we declare both use this.
export function canonicalPath(key: string): string {
  const file = key.replace(/\.md$/, "");
  if (file === "index") return "/";
  if (file.endsWith("/index")) return `/${file.slice(0, -"/index".length)}/`;
  return `/${file}.html`;
}

// In UTC, because the date it is given has no time in it: new Date("2026-09-21")
// is UTC midnight, and formatting that in a timezone west of UTC prints the day
// before — the wrong day, under a datetime= saying the right one.
const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

// A date: as a <time>, written the way a reader expects. A date nobody can
// parse is shown as it was written rather than as "Invalid Date".
export function dateHtml(date: string): string {
  if (!date) return "";
  const on = new Date(date);
  return `<time datetime="${escapeHtml(date)}">${isNaN(on.getTime()) ? escapeHtml(date) : day.format(on)}</time>`;
}
