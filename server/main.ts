import homepage from "./edit/index.html";
import { PORT, DEBUG, printConfig } from "./config";
import { handleLoginGet, handleLoginPost, handleLogout } from "./auth";
import { handlePages } from "./routes/pages";
import { handleMark } from "./routes/mark";
import { handleBrowse } from "./routes/browse";
import { handleStatic } from "./routes/static";
import { handleSite } from "./routes/site";

const server = Bun.serve({
  port: PORT,
  development: DEBUG,

  routes: {
    "/edit": homepage,
    "/login": { GET: handleLoginGet, POST: handleLoginPost },
    "/logout": handleLogout,
    "/edit/pages/*": handlePages,
    "/edit/mark/": handleMark,
    "/edit/browse/*": handleBrowse,
    "/static/*": handleStatic,
  },

  fetch: handleSite,
});

printConfig();
console.log(`  site: ${server.url}`);
console.log(`  edit: ${server.url}edit`);
console.log(`  login: ${server.url}login`);
