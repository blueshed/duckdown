import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import type { Storage } from "../storage";
import { after } from "../utils";

// The editor's file API, over one folder of the site. `pages/` was the only
// one for a while, which left the two files that actually make a site yours —
// templates/site.html and static/site.css — reachable only from a terminal.
//
// Each folder is its own route with its own root, so nothing here can reach
// across them, and users.json (password hashes, at the site root) is in none
// of them and stays unreachable.
export function fileRoutes(prefix: string, store: Storage, changed: () => void = () => {}) {
  const path = (req: BunRequest) => after(req, prefix);

  return {
    async GET(req: BunRequest) {
      const denied = await requireAuth(req);
      if (denied) return denied;
      const key = path(req);
      if (key && (await store.exists(key))) {
        return new Response(await store.read(key), {
          headers: { "Content-Type": store.mime(key) },
        });
      }
      // A missing file is a 404, not an empty folder listing in its place
      // (which the editor would open as the file's text). Anything with an
      // extension is a file; anything without is a folder to list.
      if (/\.[a-z0-9]+$/i.test(key)) return new Response("Not Found", { status: 404 });
      return Response.json(await store.list(key));
    },

    async PUT(req: BunRequest) {
      const denied = await requireAuth(req);
      if (denied) return denied;
      const key = path(req);
      // If-None-Match: * is a create-only write (the editor's New): never
      // replace a file that is already there.
      if (req.headers.get("if-none-match") === "*" && (await store.exists(key))) {
        return new Response("Already exists", { status: 412 });
      }
      await store.write(key, await req.text());
      changed();
      return Response.json({ ok: true });
    },

    async DELETE(req: BunRequest) {
      const denied = await requireAuth(req);
      if (denied) return denied;
      const key = path(req);
      if (!(await store.exists(key))) {
        return new Response("Not Found", { status: 404 });
      }
      await store.remove(key);
      changed();
      return Response.json({ ok: true });
    },
  };
}
