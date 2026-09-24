#!/usr/bin/env bun

import homepage from "./edit/index.html";
import { PORT, DEBUG, printConfig } from "./config";
import { claimPidFile } from "./pid";
import { seedLocalSite, seedBucketSite } from "./storage";
import { scaffoldNotice } from "./scaffold";
import { handleLoginGet, handleLoginPost, handleLogout, ensureAdmin } from "./auth";
import { handlePages } from "./routes/pages";
import { handleTemplateFiles, handleStaticFiles } from "./routes/site-files";
import { handleMark } from "./routes/mark";
import { handleBrowse } from "./routes/browse";
import { handleReports } from "./routes/reports";
import { handleUsers } from "./routes/users";
import { handleCollectionFiles } from "./routes/collection";
import { handleStatic } from "./routes/static";
import { handleSearch } from "./routes/search";
import { handleSitemap } from "./routes/sitemap";
import { handleSite } from "./routes/site";
import { handleError } from "./routes/error";

// The editor's stylesheet at a stable URL, for the login page (which is not
// an HTML import, so Bun never bundles its <link>).
const editorCss = Bun.file(`${import.meta.dir}/edit/styles.css`);

// Before listening: a second server stops here, and a dev site is seeded
// before any request reads it.
claimPidFile();
seedLocalSite();
await seedBucketSite();
await ensureAdmin();

export const server = Bun.serve({
  port: PORT,
  development: DEBUG,

  routes: {
    // A platform's healthcheck: proves the process is listening without
    // reading storage, so a content mistake never reads as a dead service.
    "/health": new Response("OK"),
    "/edit": homepage,
    "/edit/styles.css": editorCss,
    "/login": { GET: handleLoginGet, POST: handleLoginPost },
    "/logout": { POST: handleLogout },
    "/edit/pages/*": handlePages,
    "/edit/templates/*": handleTemplateFiles,
    "/edit/static/*": handleStaticFiles,
    "/edit/mark/": handleMark,
    "/edit/browse/*": handleBrowse,
    "/edit/reports/*": handleReports,          // what the site's own tasks left for its editors
    "/edit/users": handleUsers,                // who can sign in: names, never hashes
    "/edit/collection/*": handleCollectionFiles,   // a collection's pictures, and what's wrong with it
    "/search.json": handleSearch,
    "/sitemap.xml": handleSitemap,
    "/static/*": handleStatic,
  },

  fetch: handleSite,
  error: handleError,
});

printConfig();
console.log(`  site: ${server.url}`);
console.log(`  edit: ${server.url}edit`);
console.log(`  login: ${server.url}login`);
// Said last, so it is the thing left on screen.
if (scaffoldNotice()) console.log(scaffoldNotice());
