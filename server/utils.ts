import type { BunRequest } from "bun";

// Extract the wildcard path from the URL by stripping the route prefix, and
// decode it: storage keys are real names ("About us.md", not "About%20us.md").
export function after(req: BunRequest, prefix: string): string {
  return decodeURIComponent(new URL(req.url).pathname.slice(prefix.length));
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
