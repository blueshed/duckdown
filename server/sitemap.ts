import type { PageRef } from "./search";
import type { Languages } from "./languages";
import { escapeHtml } from "./utils";

// The pages a reader can reach, as sitemap.xml: an absolute address each, and
// the page's date: when it has one that is a date (lastmod may not be prose).
// Pages, not the search index's sections: a crawler wants each address once.
//
// A page written in more than one language names each of them (hreflang, the
// way Google reads a sitemap), itself among them, and the default's as
// x-default. A language's version of a page is the one at the same address
// under its folder, so they are found by what is left of the address once the
// folder is taken off: /about.html, /cy/about.html. A page with only one
// version, and a page standing in for a translation (which is not listed: it
// is the default's page again), names nothing. A site with one language writes
// the sitemap it always did.
export function sitemapXml(entries: PageRef[], origin: string, languages?: Languages): string {
  const others = languages?.others ?? [];
  const folder = (url: string) => others.find((lang) => url.startsWith(`/${lang}/`));   // none: the default's
  const langOf = (url: string) => folder(url) ?? languages?.main ?? "";
  const rest = (url: string) => { const lang = folder(url); return lang ? url.slice(lang.length + 1) : url; };

  const versions = new Map<string, { lang: string; url: string }[]>();
  for (const { url } of others.length ? entries : []) {
    const key = rest(url);
    versions.set(key, [...versions.get(key) ?? [], { lang: langOf(url), url }]);
  }
  const loc = (url: string) => escapeHtml(origin + encodeURI(url));
  const link = (hreflang: string, url: string) =>
    `<xhtml:link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${loc(url)}"/>`;

  const urls = entries.map((e) => {
    const lastmod = /^\d{4}-\d{2}-\d{2}/.test(e.date) ? `<lastmod>${e.date.slice(0, 10)}</lastmod>` : "";
    // The same order in each version's list, whatever order the walk found them in.
    const all = (versions.get(rest(e.url)) ?? []).sort((a, b) => others.indexOf(a.lang) - others.indexOf(b.lang));
    const original = all.find((v) => v.lang === languages?.main);
    const alternates = all.length < 2 ? "" : [
      ...all.map((v) => link(v.lang, v.url)),
      ...(original ? [link("x-default", original.url)] : []),
    ].join("");
    return `  <url><loc>${loc(e.url)}</loc>${lastmod}${alternates}</url>`;
  });
  const xhtml = [...versions.values()].some((all) => all.length > 1) ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtml}>\n${urls.join("\n")}\n</urlset>\n`;
}
