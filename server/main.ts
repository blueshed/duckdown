import homepage from "./edit/index.html";
import { PORT, DEBUG, printConfig } from "./config";
import { claimPidFile } from "./pid";
import { seedLocalSite, seedBucketSite } from "./storage";
import { scaffoldNotice } from "./scaffold";
import { handleLoginGet, handleLoginPost, handleLogout, ensureAdmin } from "./auth";
import { handlePages } from "./routes/pages";
import { handleMark } from "./routes/mark";
import { handleBrowse } from "./routes/browse";
import { handleStatic } from "./routes/static";
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
    "/edit/mark/": handleMark,
    "/edit/browse/*": handleBrowse,
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
