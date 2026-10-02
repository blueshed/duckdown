import type { PageRef } from "./search";
import { splitLanguage, type Languages } from "./languages";
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
  const loc = (url: string) => escapeHtml(origin + encodeURI(url));
  const alternates = languages?.others.length ? alternatesOf(entries, languages, loc) : new Map<string, string>();

  const urls = entries.map((e) => {
    const lastmod = /^\d{4}-\d{2}-\d{2}/.test(e.date) ? `<lastmod>${e.date.slice(0, 10)}</lastmod>` : "";
    return `  <url><loc>${loc(e.url)}</loc>${lastmod}${alternates.get(e.url) ?? ""}</url>`;
  });
  const xhtml = alternates.size ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtml}>\n${urls.join("\n")}\n</urlset>\n`;
}

// The alternates each address names, as markup: the same list for every version
// of a page, the default's first and the languages in their order.
function alternatesOf(entries: PageRef[], languages: Languages, loc: (url: string) => string): Map<string, string> {
  const link = (hreflang: string, url: string) =>
    `<xhtml:link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${loc(url)}"/>`;

  const versions = new Map<string, { lang: string; url: string }[]>();
  for (const { url } of entries) {
    const { lang, key } = splitLanguage(languages, url.slice(1));   // "/about.html" and "/cy/about.html" are both about.html
    const same = versions.get(key);
    if (same) same.push({ lang, url }); else versions.set(key, [{ lang, url }]);
  }
  const out = new Map<string, string>();
  for (const all of versions.values()) {
    if (all.length < 2) continue;
    all.sort((a, b) => languages.others.indexOf(a.lang) - languages.others.indexOf(b.lang));   // the default is -1: first
    const original = all.find((v) => v.lang === languages.main);
    const links = [...all.map((v) => link(v.lang, v.url)), ...(original ? [link("x-default", original.url)] : [])].join("");
    for (const { url } of all) out.set(url, links);
  }
  return out;
}
