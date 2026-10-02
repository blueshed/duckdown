import type { BunRequest } from "bun";
import { version } from "../package.json";

// What /health answers, on the served site and the published one alike: which
// duckdown this is, so a site's own address says what release it runs. It is
// never in a page, so an upgrade's before-and-after export stays a comparison
// of what the site writes.
export const HEALTH = `OK duckdown ${version}`;

// A request that can't be answered because of what it says, not because of
// anything we did: handleError turns it into a 400 and doesn't log a stack.
export class BadRequest extends Error {
  constructor(message: string) {   // written out: an implicit constructor is a function coverage counts and never sees
    super(message);
  }
}

// A URL path with its %-escapes undone, or null when they are malformed
// ("/%E0%A4%A") or undo to a NUL ("/static/%00"), which no file's name holds
// and Bun.file() throws on. Scanners send these all day; none of them is a bug.
export function decodePath(path: string): string | null {
  try {
    const decoded = decodeURIComponent(path);
    return decoded.includes("\0") ? null : decoded;
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

// Whether an If-None-Match names this tag: "*", or a list of tags in which a
// weak one (W/"…", as a compressing proxy leaves it) counts, since the
// comparison for a 304 is weak (RFC 9110).
function matches(header: string | null, etag: string): boolean {
  return !!header && header.split(",").some((t) => t.trim() === "*" || t.trim().replace(/^W\//, "") === etag);
}

// Answer with validators, so a browser that has the bytes already is told so
// (304) instead of being sent them again. The tag is a hash of the bytes.
export function conditional(req: Request, body: string | Uint8Array, headers: Record<string, string>): Response {
  const etag = `"${Bun.hash(body).toString(36)}"`;
  const all = { ...headers, ETag: etag };
  if (matches(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers: all });
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
const FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" };
const day = new Intl.DateTimeFormat("en-GB", FORMAT);
const days = new Map<string, Intl.DateTimeFormat>();

// The way a date is written in a language, as its readers write it: "2
// Hydref 2026". English stays as it always was (en-GB), so a site that says
// nothing of language is not changed; a tag Intl can't read is said once and
// written the same way.
function dayIn(lang: string): Intl.DateTimeFormat {
  if (!lang || lang === "en") return day;
  const had = days.get(lang);
  if (had) return had;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(lang, FORMAT);
  } catch {
    console.error(`lang: "${lang}" is not a language tag Intl knows — its dates are written as en-GB`);
    format = day;
  }
  days.set(lang, format);
  return format;
}

// A date: as a <time>, written the way a reader expects, in `lang` when the
// page is in one. A date nobody can parse is shown as it was written rather
// than as "Invalid Date".
export function dateHtml(date: string, lang = ""): string {
  if (!date) return "";
  const on = new Date(date);
  return `<time datetime="${escapeHtml(date)}">${isNaN(on.getTime()) ? escapeHtml(date) : dayIn(lang).format(on)}</time>`;
}
