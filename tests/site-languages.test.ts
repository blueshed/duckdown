// A site in more than one language, over HTTP: what answers at /cy/…, what a
// page that isn't translated yet answers with, and what the template is given
// to link the languages together.
import { describe, test, expect, beforeAll } from "bun:test";
import { BASE, signIn, authed, keepSite } from "./helpers";
import { pageHtml, parsePage } from "../server/page";
import { sourceHash } from "../server/languages";
import { createPageStorage } from "../server/storage";

keepSite();
beforeAll(signIn);

const put = (key: string, body: string) => fetch(`${BASE}/edit/pages/${key}`, authed({ method: "PUT", body }));
const putTemplate = (name: string, body: string) => fetch(`${BASE}/edit/templates/${name}`, authed({ method: "PUT", body }));

async function get(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...init });
  return { res, html: await res.text() };
}

describe("a site that says nothing of language", () => {
  test("is as it was: English, one address per page, nowhere under /cy", async () => {
    const { res, html } = await get("/index.html");
    expect(res.status).toBe(200);
    expect(html).toContain('<html lang="en">');
    expect((await get("/cy/about.html")).res.status).toBe(404);
    expect((await get("/cy/")).res.status).toBe(404);
  });

  test("a folder that happens to be called cy is only a folder", async () => {
    await put("cy/index.md", "title: A folder\n\nNothing to do with Welsh");
    await put("cy/about.md", "title: About cy\n\nStill a page");
    expect((await get("/cy/about.html")).html).toContain("Still a page");
    expect((await get("/cy/about.html")).html).toContain('<html lang="en">');
  });
});

// The site's chrome, in the two languages: the template says where the
// language's root is, lists the languages and writes the date; Welsh has a
// template of its own and an include of its own, French has neither.
const SITE = `<!DOCTYPE html>
<html lang="{{lang}}">
<head><meta charset="UTF-8"><title>{{title}}</title>
{{description}}
<link rel="canonical" href="{{url}}"></head>
<body data-root="{{root}}">
{{include topbar}}
{{languages}}
<main id="content"><p class="when">{{date}}</p>{{content}}</main>{{edit}}</body></html>`;
const SITE_CY = SITE.replace('<html lang="{{lang}}">', '<html lang="{{lang}}" data-chrome="cy">');

describe("a site in English and Welsh", () => {
  beforeAll(async () => {
    await putTemplate("site.html", SITE);
    await putTemplate("site.cy.html", SITE_CY);
    await putTemplate("topbar.cy.html", '<div id="chrome" lang="cy">Dewislen {{nav}}</div>');
    await put("cy/index.md", "lang: cy\ntitle: Hafan\nuntranslated: Nid yw'r dudalen hon wedi'i chyfieithu eto.\n\n# Croeso");
    await put("fr/index.md", "lang: fr\ntitle: Accueil\n\n# Bienvenue");
    await put("about.md", "title: About\n\nAbout us");
    await put("cy/about.md", "title: Amdanom\naliases: /cy/hen-about\ndate: 2026-10-02\n\nAmdanom ni");
    await put("contact.md", "title: Contact\ndate: 2026-10-02\n\nWrite to us");
    await put("later.md", "title: Later\n\nOne day");
    await put("cy/later.md", "title: Yn ddiweddarach\ndraft: true\n\nUn diwrnod");
    await put("soon.md", "title: Soon\ndraft: true\n\nNot yet");
    await put("cy/lleol.md", "title: Lleol\n\nDim ond yma");
    await put("news/index.md", "title: News\n\nThe news");
    await put("cy/news/index.md", "title: Newyddion\n\nY newyddion");
    await put("quote.md", "title: Quote\nlang: fr\ndate: 2026-10-02\n\nUne citation");
  });

  describe("a page written in the language", () => {
    test("answers at its own address, in its language, in its own template", async () => {
      for (const path of ["/cy/about.html", "/cy/about"]) {
        const { res, html } = await get(path);
        expect(res.status).toBe(200);
        expect(html).toContain('<html lang="cy" data-chrome="cy">');
        expect(html).toContain("Amdanom ni");
        expect(html).not.toContain("About us");
        expect(html).toContain('<body data-root="/cy/">');
        expect(html).toContain("<title>Amdanom</title>");
        expect(html).not.toContain('<p class="untranslated"');
      }
    });

    test("its include has the language's words, and its date the language's way of writing it", async () => {
      const { html } = await get("/cy/about.html");
      expect(html).toContain('<div id="chrome" lang="cy">Dewislen ');
      expect(html).not.toContain("Search this site");
      expect(html).toContain('<time datetime="2026-10-02">2 Hydref 2026</time>');
    });

    test("a folder's index answers at the folder, with and without the slash", async () => {
      for (const path of ["/cy/news", "/cy/news/", "/cy/news/index.html"]) {
        const { res, html } = await get(path);
        expect(res.status).toBe(200);
        expect(html).toContain("Y newyddion");
      }
    });

    test("the language's home answers at the language", async () => {
      for (const path of ["/cy", "/cy/", "/cy/index.html"]) {
        const { res, html } = await get(path);
        expect(res.status).toBe(200);
        expect(html).toContain("<h1 id=\"croeso\">");
        expect(html).toContain('<html lang="cy" data-chrome="cy">');
      }
    });

    test("an address it used to have still moves", async () => {
      const { res } = await get("/cy/hen-about");
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe("/cy/about.html");
    });

    test("a page of its own, with nothing to translate, is a page; and has no switcher, for there is nowhere to switch to", async () => {
      const { res, html } = await get("/cy/lleol.html");
      expect(res.status).toBe(200);
      expect(html).toContain("Dim ond yma");
      expect(html).not.toContain('class="languages"');
    });

    test("is not what the default language's address answers", async () => {
      expect(await (await get("/about.html")).html).toContain("About us");
      expect((await get("/about.html")).html).toContain('<html lang="en">');
    });
  });

  describe("a page not yet translated", () => {
    test("is the default language's page at the language's address, with a note in the language's words", async () => {
      const { res, html } = await get("/cy/contact.html");
      expect(res.status).toBe(200);
      expect(html).toContain("Write to us");
      expect(html).toContain('<p class="untranslated" lang="cy" role="note">Nid yw\'r dudalen hon wedi\'i chyfieithu eto.</p>');
    });

    test("is in the language's site and in the page's own language: its chrome Welsh, its words English", async () => {
      const { html } = await get("/cy/contact.html");
      expect(html).toContain('<html lang="en" data-chrome="cy">');
      expect(html).toContain('<body data-root="/cy/">');
      expect(html).toContain('<div id="chrome" lang="cy">');
      expect(html).toContain('<time datetime="2026-10-02">2 October 2026</time>');
    });

    test("names the default's page as its own address, so a search engine sees one", async () => {
      const { html } = await get("/cy/contact.html");
      expect(html).toContain(`<link rel="canonical" href="${BASE}/contact.html">`);
    });

    test("tells a language that gave no words in English, and says that it is", async () => {
      const { html } = await get("/fr/contact.html");
      expect(html).toContain('<p class="untranslated" lang="en" role="note">This page has not been translated yet.</p>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<body data-root="/fr/">');
      expect(html).toContain("Search this site");   // no topbar.fr.html: the default's chrome
      expect(html).not.toContain("data-chrome");     // and no site.fr.html
    });

    test("a draft translation is the default's page to a reader, and the draft to the editor", async () => {
      const reader = (await get("/cy/later.html")).html;
      expect(reader).toContain("One day");
      expect(reader).toContain('<p class="untranslated"');
      expect(reader).not.toContain("Un diwrnod");

      const editor = await get("/cy/later.html", authed());
      expect(editor.html).toContain("Un diwrnod");
      expect(editor.html).not.toContain('<p class="untranslated"');
      expect(editor.res.headers.get("cache-control")).toBe("private, no-cache");
      expect(editor.html).toContain('href="/edit?path=cy%2Flater.md"');
    });

    test("an editor looking at a fallback is offered the page it is", async () => {
      const { html } = await get("/cy/contact.html", authed());
      expect(html).toContain('href="/edit?path=contact.md"');
      expect(html).toContain('<p class="untranslated"');
    });

    test("a draft with no translation is nothing to a reader, and a page to the editor", async () => {
      expect((await get("/cy/soon.html")).res.status).toBe(404);
      const editor = await get("/cy/soon.html", authed());
      expect(editor.res.status).toBe(200);
      expect(editor.html).toContain("Not yet");
    });

    test("is cached like any page, and answers 304 to a reader's copy", async () => {
      const first = await fetch(`${BASE}/cy/contact.html`);
      const etag = first.headers.get("etag")!;
      expect(etag).toBeTruthy();
      await first.text();
      const again = await fetch(`${BASE}/cy/contact.html`, { headers: { "If-None-Match": etag } });
      expect(again.status).toBe(304);
    });
  });

  describe("what is not a page of the language", () => {
    test("is a miss, never a nearest match", async () => {
      expect((await get("/cy/nowhere.html")).res.status).toBe(404);
      expect((await get("/cy/news/nowhere.html")).res.status).toBe(404);
    });

    test("a name that isn't a language of the site is a miss", async () => {
      expect((await get("/zz/about.html")).res.status).toBe(404);
    });

    test("an address that climbs out is refused as it is anywhere", async () => {
      const here = (await get("/cy/..%2Fusers.json")).res.status;
      expect(here).toBe((await get("/..%2Fusers.json")).res.status);
      expect(here).toBe(400);
    });
  });

  describe("the switcher", () => {
    const list = (html: string) => html.match(/<ul class="languages">[\s\S]*?<\/ul>/)?.[0] ?? "";

    test("links the page in every language, each named in its own, the reader's marked", async () => {
      const { html } = await get("/cy/about.html");
      expect(list(html)).toBe([
        '<ul class="languages">',
        '<li><a href="/about.html" hreflang="en" lang="en">English</a></li>',
        '<li><a href="/cy/about.html" hreflang="cy" lang="cy" aria-current="true">Cymraeg</a></li>',
        '<li><a href="/fr/about.html" hreflang="fr" lang="fr" class="untranslated">français</a></li>',
        "</ul>",
      ].join("\n"));
    });

    test("from the default's page it is the same list, with the default's marked", async () => {
      const { html } = await get("/about.html");
      expect(list(html)).toContain('hreflang="en" lang="en" aria-current="true">English</a>');
      expect(list(html)).toContain('<a href="/cy/about.html" hreflang="cy" lang="cy">Cymraeg</a>');
    });

    test("a fallback is a link that says so, and the page that is one is marked as the reader's", async () => {
      const { html } = await get("/cy/contact.html");
      expect(list(html)).toContain('<a href="/cy/contact.html" hreflang="cy" lang="cy" class="untranslated" aria-current="true">Cymraeg</a>');
      expect(list(html)).toContain('<a href="/contact.html" hreflang="en" lang="en">English</a>');
    });

    test("a language's home is its index.md, which is the translation of the default's", async () => {
      const { html } = await get("/index.html");
      expect(list(html)).toBe([
        '<ul class="languages">',
        '<li><a href="/" hreflang="en" lang="en" aria-current="true">English</a></li>',
        '<li><a href="/cy/" hreflang="cy" lang="cy">Cymraeg</a></li>',
        '<li><a href="/fr/" hreflang="fr" lang="fr">français</a></li>',
        "</ul>",
      ].join("\n"));
    });

    test("a language with no page, because it is a draft there and here, is not in it", async () => {
      expect(list((await get("/cy/soon.html", authed())).html)).toBe("");   // only the editor sees it; to readers it is in no language
    });
  });

  describe("the nav", () => {
    const nav = (html: string) => html.match(/<nav>[\s\S]*?<\/nav>/)?.[0] ?? "";
    const hrefs = (html: string) => [...nav(html).matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);

    test("a page of the language has the language's nav: its pages' labels, its addresses, the reader's place marked", async () => {
      const { html } = await get("/cy/about.html");
      expect(nav(html)).toContain('<a href="/cy/" aria-current="true">Hafan</a>');
      expect(nav(html)).toContain('<a href="/cy/news/">Newyddion</a>');   // translated: its own label
      expect(nav(html)).toContain('<a href="/cy/blog/">Blog</a>');         // not: the default's
      expect(hrefs(html).every((href) => href!.startsWith("/cy/"))).toBe(true);
      expect(nav(html)).not.toContain('href="/fr/');
    });

    test("so does a page standing in for its translation", async () => {
      const { html } = await get("/cy/contact.html");
      expect(hrefs(html)).toContain("/cy/news/");
      expect(hrefs(html).every((href) => href!.startsWith("/cy/"))).toBe(true);
    });

    test("the default's has no other language in it", async () => {
      const { html } = await get("/about.html");
      expect(hrefs(html)).toContain("/news/");
      expect(hrefs(html).some((href) => href!.startsWith("/cy/") || href!.startsWith("/fr/"))).toBe(false);
    });

    test("a folder's fallback is where the reader is: the nav marks it as their page", async () => {
      const { html } = await get("/cy/blog/");
      expect(nav(html)).toContain('<a href="/cy/blog/" aria-current="page">Blog</a>');
      const inside = await get("/cy/guide/pages.html");
      expect(inside.res.status).toBe(200);
      expect(nav(inside.html)).toContain('<a href="/cy/guide/" aria-current="true">Guide</a>');
    });
  });

  describe("{{pages}} and {{sitemap}}", () => {
    test("a fallback folder lists the default's pages as the language's own, so a reader stays in the language", async () => {
      const { html } = await get("/cy/blog/");
      expect(html).toContain('href="/cy/blog/a-post-with-its-own-layout.html"');
      expect(html).toContain('href="/cy/blog/one-page-that-looks-different.html"');
      expect(html).not.toContain('href="/blog/a-post');
      expect(html).toContain('<p class="untranslated"');
    });

    test("a translated folder lists what answers there: its own titles, the default's where it has none", async () => {
      await put("cy/blog/index.md", "title: Blog\nnav: Blog\n\n# Blog Cymraeg\n\n{{pages}}");
      await put("cy/blog/a-post-with-its-own-layout.md", "title: Cofnod\nlayout: post\n\nCofnod yn Gymraeg");
      const { html } = await get("/cy/blog/");
      expect(html).toContain('<a href="/cy/blog/a-post-with-its-own-layout.html">Cofnod</a>');
      expect(html).toContain('<a href="/cy/blog/one-page-that-looks-different.html">');
      expect(html).not.toContain('<p class="untranslated"');
      expect((await get("/cy/blog/a-post-with-its-own-layout.html")).html).toContain("Cofnod yn Gymraeg");
    });

    test("the default's are as they were", async () => {
      const { html } = await get("/blog/");
      expect(html).toContain('href="/blog/a-post-with-its-own-layout.html"');
      expect(html).not.toContain("/cy/blog/a-post");
      expect(html).not.toContain("Cofnod");
    });

    test("the sitemap is the language's site", async () => {
      const welsh = (await get("/cy/sitemap.html")).html;
      expect(welsh).toContain('<a href="/cy/">Hafan</a>');
      expect(welsh).toContain('<a href="/cy/blog/">Blog</a>');
      const map = (html: string) => html.match(/<ul class="sitemap">[\s\S]*<\/ul>/)?.[0] ?? "";
      expect(map(welsh)).not.toContain('href="/fr/');
      expect(map(welsh)).not.toContain('href="/blog/');
      const english = (await get("/sitemap.html")).html;
      expect(map(english)).toContain('<a href="/">');
      expect(map(english)).not.toContain('href="/cy/');
      expect(map(english)).not.toContain('href="/fr/');
    });
  });

  describe("a miss in a language", () => {
    test("is the default's 404 in the language's site, with the note that it isn't in the language", async () => {
      const { res, html } = await get("/cy/nowhere.html");
      expect(res.status).toBe(404);
      expect(html).toContain("There is nothing at that address");
      expect(html).toContain('<html lang="en" data-chrome="cy">');
      expect(html).toContain('<p class="untranslated" lang="cy" role="note">');
      expect(html).toContain('<body data-root="/cy/">');
    });

    test("is the language's own 404 when it has one", async () => {
      await put("cy/404.md", "title: Ddim yma\n\nWedi mynd");
      const { res, html } = await get("/cy/nowhere.html");
      expect(res.status).toBe(404);
      expect(html).toContain("Wedi mynd");
      expect(html).toContain('<html lang="cy" data-chrome="cy">');
      expect(html).not.toContain('<p class="untranslated"');
      expect((await get("/cy/news/nowhere.html")).html).toContain("Wedi mynd");
    });

    test("is another language's too, and says in English when it has no words of its own", async () => {
      const { res, html } = await get("/fr/nowhere.html");
      expect(res.status).toBe(404);
      expect(html).toContain("There is nothing at that address");
      expect(html).toContain('<p class="untranslated" lang="en" role="note">This page has not been translated yet.</p>');
    });

    test("is not what the default language's miss answers with", async () => {
      const { res, html } = await get("/nowhere.html");
      expect(res.status).toBe(404);
      expect(html).toContain("There is nothing at that address");
      expect(html).toContain('<body data-root="/">');
      expect(html).not.toContain('<p class="untranslated"');
      expect(html).not.toContain('class="languages"');   // a miss is not a page with translations
    });

    test("is a plain line when the site has no 404 page at all", async () => {
      const was = await (await fetch(`${BASE}/edit/pages/404.md`, authed())).text();
      await fetch(`${BASE}/edit/pages/404.md`, authed({ method: "DELETE" }));
      try {
        const { res, html } = await get("/fr/nowhere.html");
        expect(res.status).toBe(404);
        expect(html).toBe("Not Found");
        expect((await get("/cy/nowhere.html")).html).toContain("Wedi mynd");   // its own, still
      } finally {
        await put("404.md", was);
      }
    });
  });

  describe("search", () => {
    const json = async (path: string) => (await fetch(`${BASE}${path}`)).json();
    // Every entry of an index, page by page from its parts, as the browser reads them.
    async function entries(root: string) {
      const found: { url: string; title: string }[] = [];
      for (let n = 0; ; n++) {
        const res = await fetch(`${BASE}${root}search/pages/${n}.json`);
        if (res.status !== 200) return found;
        found.push(...(await res.json()));
      }
    }

    test("a language has an index of its own, under its own address: the same three kinds of file", async () => {
      const res = await fetch(`${BASE}/cy/search/index.json`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(res.headers.get("cache-control")).toBe("no-cache");
      const { version, words } = await res.json();
      expect(version).toMatch(/^[0-9a-f]{12}$/);
      expect(words).toContain("am");                              // amdanom
      expect(await json("/cy/search/words/am.json")).toHaveProperty("amdanom");
      expect((await entries("/cy/")).some((e) => e.url === "/cy/")).toBe(true);
    });

    test("is of the pages written in it, and the default's of the pages written in that", async () => {
      const welsh = await entries("/cy/");
      expect(welsh.length).toBeGreaterThan(0);
      expect(welsh.every((e) => e.url.startsWith("/cy/"))).toBe(true);
      expect(welsh.map((e) => e.title)).toContain("Amdanom");
      const main = await entries("/");
      expect(main.some((e) => e.url === "/about.html")).toBe(true);
      expect(main.some((e) => e.url.startsWith("/cy/") || e.url.startsWith("/fr/"))).toBe(false);
      // "croeso" is Welsh: not in the default's shard for "cr", and "about" is not in the Welsh one for "ab".
      expect(await json("/search/words/cr.json")).not.toHaveProperty("croeso");
      expect(await json("/cy/search/words/cr.json")).toHaveProperty("croeso");
      const shard = await fetch(`${BASE}/cy/search/words/ab.json`);
      expect(shard.status === 404 || !("about" in (await shard.json()))).toBe(true);
    });

    test("a language's 404 page is not a page to search for, nor is the default's", async () => {
      const everything = [...await entries("/"), ...await entries("/cy/"), ...await entries("/fr/")].map((e) => e.url);
      expect(everything.some((url) => url.endsWith("404.html"))).toBe(false);
    });

    test("is validated like the default's: a part there isn't is a miss", async () => {
      expect((await get("/cy/search/words/zz.json")).res.status).toBe(404);
      expect((await get("/cy/search/pages/9999.json")).res.status).toBe(404);
    });

    test("is conditional like the default's: a 304 for a copy that is still the one", async () => {
      const first = await fetch(`${BASE}/cy/search/index.json`);
      const etag = first.headers.get("etag")!;
      await first.text();
      expect((await fetch(`${BASE}/cy/search/index.json`, { headers: { "If-None-Match": etag } })).status).toBe(304);
    });

    test("a name that isn't a language of the site has no index, and is the site's own miss", async () => {
      const { res, html } = await get("/zz/search/index.json");
      expect(res.status).toBe(404);
      expect(html).toContain("There is nothing at that address");
      expect((await get("/zz/search/words/ab.json")).res.status).toBe(404);
    });

    test("the whole index, for a search.js from before the parts, is the default's", async () => {
      const whole: { url: string }[] = await json("/search.json");
      expect(whole.some((e) => e.url === "/about.html")).toBe(true);
      expect(whole.some((e) => e.url.startsWith("/cy/"))).toBe(false);
    });

    test("the sitemap takes in every language's pages, and no 404 page", async () => {
      const { html } = await get("/sitemap.xml");
      expect(html).toContain(`<loc>${BASE}/about.html</loc>`);
      expect(html).toContain(`<loc>${BASE}/cy/about.html</loc>`);
      expect(html).toContain(`<loc>${BASE}/cy/lleol.html</loc>`);
      expect(html).not.toContain("404.html");
    });

    test("and a page written in two languages names both, as the head of the page does", async () => {
      const { html } = await get("/sitemap.xml");
      expect(html).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
      const about = [
        `<xhtml:link rel="alternate" hreflang="en" href="${BASE}/about.html"/>`,
        `<xhtml:link rel="alternate" hreflang="cy" href="${BASE}/cy/about.html"/>`,
        `<xhtml:link rel="alternate" hreflang="x-default" href="${BASE}/about.html"/>`,
      ].join("");
      expect(html).toContain(`<loc>${BASE}/about.html</loc>${about}</url>`);
      expect(html).toContain(`<loc>${BASE}/cy/about.html</loc><lastmod>2026-10-02</lastmod>${about}</url>`);
      expect(html).toContain(`<loc>${BASE}/cy/lleol.html</loc></url>`);   // written in Welsh alone

    });
  });

  describe("a collection", () => {
    // The seed's gallery, with First Light given Welsh words and Second Wind
    // begun; the others have none, and neither has French.
    beforeAll(async () => {
      // The item template says where the languages are, as a site that wants them does.
      const template = await (await fetch(`${BASE}/edit/templates/item.html`, authed())).text();
      await putTemplate("item.html", template.replace('<main id="content">', '<main id="content">\n{{languages}}'));
      const gallery = await (await fetch(`${BASE}/edit/pages/gallery/collection.json`, authed())).text();
      expect(JSON.parse(gallery).groups).toBeDefined();
      await put("cy/gallery/collection.json", JSON.stringify({
        items: {
          "first-light": { title: "Golau cyntaf", caption: "Golau cyntaf, 1961. Inc ar bapur.", "translated-from": "00000000" },
          "second-wind": { title: "Gwynt eilradd" },
        },
        groups: { paintings: "Paentiadau" },
      }));
    });
    const nav = (html: string) => html.match(/<nav class="item-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";

    test("an item with words in the language is its own page there: its words, its language, its address", async () => {
      const { res, html } = await get("/cy/gallery/first-light/");
      expect(res.status).toBe(200);
      expect(html).toContain("<title>Golau cyntaf</title>");
      expect(html).toContain("Golau cyntaf, 1961. Inc ar bapur.");
      expect(html).toContain('<html lang="cy">');
      expect(html).not.toContain('<p class="untranslated"');
      expect(html).toContain('<a href="/cy/by-year.html#1961">');                  // {{root}} in the seed's item template
      expect(nav(html)).toContain('href="/cy/gallery/second-wind/"');                // prev and next stay in the language
      expect(html).toContain('<nav class="groups"');
      expect(html.match(/<nav class="groups"[\s\S]*?<\/nav>/)![0]).toContain('href="/cy/gallery/first-light/"');   // the groups' menu is the language's
    });

    test("one with none is the default's words at the language's address, with the note", async () => {
      const { res, html } = await get("/cy/gallery/study-in-green/");
      expect(res.status).toBe(200);
      expect(html).toContain("Study in Green, 1962. Crayon on paper.");
      expect(html).toContain('<p class="untranslated" lang="cy" role="note">');
      expect(html).toContain("<title>Study in Green</title>");
      expect(html).toContain('<html lang="cy">');
    });

    test("a language that has said nothing of it has every item all the same, with the note in English", async () => {
      const { res, html } = await get("/fr/gallery/first-light/");
      expect(res.status).toBe(200);
      expect(html).toContain("First Light, 1961. Ink on paper, 40 x 40 cm.");
      expect(html).toContain('<p class="untranslated" lang="en" role="note">This page has not been translated yet.</p>');
    });

    test("an address the collection doesn't hold is a miss, in the language", async () => {
      expect((await get("/cy/gallery/nowhere/")).res.status).toBe(404);
      expect((await get("/cy/gallery/nowhere/")).html).toContain('<html lang="cy"');
    });

    test("the overview in the language lists the language's items, headed in its words", async () => {
      const { html } = await get("/cy/gallery/");
      expect(html).toContain('<a class="item" href="/cy/gallery/first-light/">');
      expect(html).toContain("Golau cyntaf");
      expect(html).toContain("<h2>Paentiadau</h2>");
      expect(html).not.toContain('href="/gallery/first-light/"');
      expect(html).toContain('<p class="untranslated"');   // the overview page is not translated: the default's, with the note
    });

    test("the switcher on an item links it in every language, and the translated one is not marked", async () => {
      const { html } = await get("/cy/gallery/first-light/");
      const list = html.match(/<ul class="languages">[\s\S]*?<\/ul>/)?.[0] ?? "";
      expect(list).toContain('<a href="/gallery/first-light/" hreflang="en" lang="en">English</a>');
      expect(list).toContain('<a href="/cy/gallery/first-light/" hreflang="cy" lang="cy" aria-current="true">Cymraeg</a>');
      expect(list).toContain('<a href="/fr/gallery/first-light/" hreflang="fr" lang="fr" class="untranslated">français</a>');
      const plain = (await get("/gallery/first-light/")).html.match(/<ul class="languages">[\s\S]*?<\/ul>/)?.[0] ?? "";
      expect(plain).toContain('<a href="/cy/gallery/first-light/" hreflang="cy" lang="cy">Cymraeg</a>');
      const standing = (await get("/cy/gallery/study-in-green/")).html.match(/<ul class="languages">[\s\S]*?<\/ul>/)?.[0] ?? "";
      expect(standing).toContain('<a href="/cy/gallery/study-in-green/" hreflang="cy" lang="cy" class="untranslated" aria-current="true">Cymraeg</a>');
    });

    test("is in the language's search when it has words there, and not otherwise", async () => {
      const found: string[] = [];
      for (let n = 0; ; n++) {
        const res = await fetch(`${BASE}/cy/search/pages/${n}.json`);
        if (res.status !== 200) break;
        found.push(...(await res.json()).map((e: { url: string }) => e.url));
      }
      expect(found).toContain("/cy/gallery/first-light/");
      expect(found).toContain("/cy/gallery/second-wind/");
      expect(found).not.toContain("/cy/gallery/study-in-green/");
    });

    test("is in the sitemap where it is written in the language, naming its other versions", async () => {
      const { html } = await get("/sitemap.xml");
      expect(html).toContain(`<loc>${BASE}/cy/gallery/first-light/</loc>`);
      expect(html).toContain(`<xhtml:link rel="alternate" hreflang="cy" href="${BASE}/cy/gallery/first-light/"/>`);
      expect(html).not.toContain(`${BASE}/cy/gallery/study-in-green/`);
    });

    test("the head names its other versions", async () => {
      const pages = createPageStorage();
      const { itemAt } = await import("../server/collection");
      const found = (await itemAt(pages, "cy/gallery/first-light"))!;
      const { itemPage } = await import("../server/page");
      const { html } = await pageHtml(itemPage(found), { origin: "https://example.test", item: found });
      expect(html).toContain('<link rel="alternate" hreflang="cy" href="https://example.test/cy/gallery/first-light/">');
      expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://example.test/gallery/first-light/">');
      const standing = (await itemAt(pages, "cy/gallery/study-in-green"))!;
      expect((await pageHtml(itemPage(standing), { origin: "https://example.test", item: standing })).html).not.toContain('rel="alternate"');
    });

    test("the preview of the language's each: page is the language's first item", async () => {
      await put("cy/gallery/item.md", "each: true\nlayout: item\n\n<p>Gwaith: {{item-title}}</p>");
      const res = await fetch(`${BASE}/edit/mark/?path=cy/gallery/item.md`, authed({
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "each: true\nlayout: item\n\n<p>Gwaith: {{item-title}}</p>" }),
      }));
      expect((await res.json()).html).toContain("Gwaith: Golau cyntaf");
      expect((await get("/cy/gallery/first-light/")).html).toContain("Gwaith: Golau cyntaf");   // and it is the page the item gets
    });
  });

  describe("what the editor asks to keep the languages together", () => {
    const ask = (path: string, init: RequestInit = {}) => fetch(`${BASE}/edit/translations${path}`, authed(init));

    test("is for whoever is signed in", async () => {
      expect((await fetch(`${BASE}/edit/translations`)).status).toBe(401);
      expect((await fetch(`${BASE}/edit/translations?draft=cy&key=contact.md`)).status).toBe(401);
      expect((await fetch(`${BASE}/edit/translations?stamp=cy&key=contact.md`, { method: "POST", body: "x" })).status).toBe(401);
    });

    test("says the site's languages, and where each page stands in each", async () => {
      const { main, others, rows } = await (await ask("")).json();
      expect([main, others]).toEqual(["en", ["cy", "fr"]]);
      const row = (lang: string, key: string) => rows.find((r: { lang: string; key: string }) => r.lang === lang && r.key === key);
      expect(row("cy", "about.md")).toEqual({ lang: "cy", key: "about.md", standing: "unchecked", draft: false });
      expect(row("cy", "lleol.md").standing).toBe("own");
      expect(row("cy", "later.md")).toEqual({ lang: "cy", key: "later.md", standing: "unchecked", draft: true });
      expect(row("fr", "about.md").standing).toBe("missing");
      expect(row("cy", "gallery/collection.json#first-light")?.standing ?? "x").not.toBe("fresh");   // an item, once the collection has words
    });

    test("a page to translate comes as a draft, saying what it is made from; the home says which language", async () => {
      const res = await ask("?draft=cy&key=contact.md");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");
      const draft = await res.text();
      expect(draft).toContain("draft: true");
      expect(draft).toContain(`translated-from: ${sourceHash(await (await fetch(`${BASE}/edit/pages/contact.md`, authed())).text())}`);
      expect(draft).toContain("Write to us");
      expect((await ask("?draft=fr&key=index.md")).status).toBe(412);   // its home is there already
      // A language that isn't there yet is added by translating the home into it.
      const added = await (await ask("?draft=de&key=index.md")).text();
      expect(added).toContain("lang: de");
      expect(added).toContain("untranslated:");
    });

    test("and is refused for what isn't a page to translate, or already is", async () => {
      expect((await ask("?draft=cy&key=about.md")).status).toBe(412);            // there is a translation
      expect((await ask("?draft=zz&key=contact.md")).status).toBe(400);          // and no such language
      expect((await ask("?draft=de&key=contact.md")).status).toBe(400);          // one is added by its home
      expect((await ask("?draft=en&key=index.md")).status).toBe(400);            // not the default's
      expect((await ask("?draft=cy&key=cy/about.md")).status).toBe(400);         // not of a language's tree
      expect((await ask("?draft=cy&key=nowhere.md")).status).toBe(404);
      expect((await ask("?draft=cy&key=gallery/item.md")).status).toBe(400);     // each: is its items
      expect((await ask("?draft=cy&key=contact.txt")).status).toBe(400);
      expect((await ask("?draft=cy")).status).toBe(400);
      expect((await ask("?draft=cy&key=.hidden/x.md")).status).toBe(400);
    });

    test("a collection comes beside what the language says of it", async () => {
      const view = await (await ask("?items=cy&folder=gallery")).json();
      expect(view.file).toBe("cy/gallery/collection.json");
      expect(view.fields.map((f: { name: string }) => f.name)).toEqual(["title", "caption", "year"]);   // the text and long ones: not the picture
      const first = view.items.find((i: { slug: string }) => i.slug === "first-light");
      expect(first.hash).toMatch(/^[0-9a-f]{8}$/);
      expect(first.fields.title).toBe("First Light");
      expect(first.thumb).toContain("one");
      expect(view.items.map((i: { slug: string }) => i.slug)).toContain("study-in-green");
      expect(view.groups[0]).toEqual({ name: "paintings", label: "Paintings" });   // what the language says of them is in its file
      expect((await ask("?items=zz&folder=gallery")).status).toBe(400);
      expect((await ask("?items=cy&folder=nowhere")).status).toBe(404);
      expect((await ask("?items=cy")).status).toBe(404);
    });

    test("saying a translation is up to date is the body, stamped with what it is made from", async () => {
      const source = await (await fetch(`${BASE}/edit/pages/contact.md`, authed())).text();
      const res = await ask("?stamp=cy&key=contact.md", { method: "POST", body: "title: Cysylltu\ntranslated-from: 00000000\n\nYsgrifennwch" });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain(`translated-from: ${sourceHash(source)}`);
      expect(text).not.toContain("00000000");
      expect(text).toContain("Ysgrifennwch");
      expect((await ask("?stamp=zz&key=contact.md", { method: "POST", body: "x" })).status).toBe(400);
      expect((await ask("?stamp=cy&key=nowhere.md", { method: "POST", body: "x" })).status).toBe(404);
      expect((await ask("", { method: "POST", body: "x" })).status).toBe(404);
    });
  });

  describe("a page that says its own language", () => {
    test("is in it, whatever site it is in: its words, its date", async () => {
      const { html } = await get("/quote.html");
      expect(html).toContain('<html lang="fr">');
      expect(html).toContain('<time datetime="2026-10-02">2 octobre 2026</time>');
      expect(html).toContain('<body data-root="/">');
    });
  });

  describe("what is given to a search engine", () => {
    const pages = createPageStorage();
    const origin = "https://example.test";
    const render = async (key: string, extra = {}) =>
      (await pageHtml(parsePage(key, await pages.read(key)), { origin, ...extra })).html;
    const links = (html: string) => [...html.matchAll(/<link rel="alternate" hreflang="[^"]+" href="[^"]+">/g)].map((m) => m[0]);

    test("a page written in two languages names each, and the default as the one for everyone else", async () => {
      const expected = [
        `<link rel="alternate" hreflang="en" href="${origin}/about.html">`,
        `<link rel="alternate" hreflang="cy" href="${origin}/cy/about.html">`,
        `<link rel="alternate" hreflang="x-default" href="${origin}/about.html">`,
      ];
      expect(links(await render("about.md"))).toEqual(expected);
      expect(links(await render("cy/about.md"))).toEqual(expected);
    });

    test("a page with only one written version, fallbacks being the same page again, names nothing", async () => {
      expect(links(await render("contact.md"))).toEqual([]);
      expect(links(await render("contact.md", { fallbackFor: "cy" }))).toEqual([]);
    });

    test("a page of a language's own has no default to name", async () => {
      expect(links(await render("cy/lleol.md"))).toEqual([]);
    });

    test("with no origin there is no address to give", async () => {
      expect(links(await render("about.md", { origin: "" }))).toEqual([]);
    });
  });

  describe("the preview", () => {
    test("a link into the language to a page it hasn't translated leads somewhere, as one to nothing doesn't", async () => {
      const res = await fetch(`${BASE}/edit/mark/?path=cy/about.md`, authed({
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "title: Amdanom\n\n[a](/cy/contact.html) [b](/cy/gallery/study-in-green/) [c](/cy/nowhere.html) [d](/cy/hen-about.html)" }),   // d: an address the page used to have, which moves
      }));
      const { problems } = await res.json();
      expect(problems).toEqual(["Links that lead nowhere a reader can go: /cy/nowhere.html"]);
    });

    test("renders a page of the language as the site does", async () => {
      const res = await fetch(`${BASE}/edit/mark/?path=cy/about.md`, authed({
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "title: Amdanom\n\nNi" }),
      }));
      const { html } = await res.json();
      expect(html).toContain('<html lang="cy" data-chrome="cy">');
      expect(html).toContain('<body data-root="/cy/">');
    });
  });
});
