import { createPageStorage } from "../storage";
import { pageList } from "../search";
import { sitemapXml } from "../sitemap";
import { siteOrigin } from "./site";

const pages = createPageStorage();

// /sitemap.xml — the pages the search index was built from, so drafts and the
// 404 page are left out, and dropped together with it when a page changes.
export const handleSitemap = async (req: Request) =>
  new Response(sitemapXml(await pageList(pages), siteOrigin(req)), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
