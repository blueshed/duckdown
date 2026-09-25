// Times what the site knows about itself, cold and kept, against DUCKDOWN_PATH
// (set by run.ts before this process starts, so the modules read it as they load).
import { createPageStorage } from "../server/storage";
import { siteNav, folderListing, siteMap } from "../server/nav";
import { searchIndex } from "../server/search";
import { siteChanged } from "../server/kept";
import { parsePage, pageHtml } from "../server/page";
import { exportSite } from "../server/export";
const t = async (what: string, fn: () => Promise<unknown>) => {
  const s = performance.now(); await fn(); const ms = performance.now() - s;
  console.log(`${what.padEnd(46)} ${ms.toFixed(0).padStart(7)} ms`); return ms;
};
const pages = createPageStorage();
const render = async (key: string) => pageHtml(parsePage(key, await pages.read(key)), { origin: "https://example.com" } as any);
await t("nav, cold", () => siteNav(pages));
await t("nav, kept", () => siteNav(pages));
await t("one folder's {{pages}}, cold", () => folderListing(pages, "folder-3"));
await t("{{sitemap}}, cold", () => siteMap(pages));
await t("search index (search.json, sitemap.xml), cold", () => searchIndex(pages));
await t("a page, first render (the rest already kept)", () => render("folder-3/page-7.md"));
await t("a page, next render", () => render("folder-3/page-8.md"));
await t("the front page ({{sitemap}}), kept", () => render("index.md"));
siteChanged();
await t("after a save: the next page render", () => render("folder-3/page-9.md"));
await t("after a save: search index again", () => searchIndex(pages));
await t("the whole export", () => exportSite({ out: process.argv[2]!, origin: "https://example.com", say: () => {} } as any));
