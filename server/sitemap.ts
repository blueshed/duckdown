import type { PageRef } from "./search";
import { escapeHtml } from "./utils";

// The pages a reader can reach, as sitemap.xml: an absolute address each, and
// the page's date: when it has one that is a date (lastmod may not be prose).
// Pages, not the search index's sections: a crawler wants each address once.
export function sitemapXml(entries: PageRef[], origin: string): string {
  const urls = entries.map((e) => {
    const lastmod = /^\d{4}-\d{2}-\d{2}/.test(e.date) ? `<lastmod>${e.date.slice(0, 10)}</lastmod>` : "";
    return `  <url><loc>${escapeHtml(origin + encodeURI(e.url))}</loc>${lastmod}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
