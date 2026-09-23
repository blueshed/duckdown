import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { storageAt, type Storage } from "../storage";
import { History, HISTORY_PATH, plainKey } from "../history";
import { after } from "../utils";

// The editor's file API, over one folder of the site. `pages/` was the only
// one for a while, which left the two files that actually make a site yours —
// templates/site.html and static/site.css — reachable only from a terminal.
//
// Each folder is its own route with its own root, so nothing here can reach
// across them, and users.json (password hashes, at the site root) is in none
// of them and stays unreachable.
//
// Every file here has earlier versions (history.ts): a save keeps what it
// replaces, a delete keeps what it removes, and the same address answers
// ?versions, ?version=<id> and ?deleted, and restores with POST ?restore=<id>.
// The history is per section, so a page's versions are only ever a page's.
export function fileRoutes(
  prefix: string, store: Storage, changed: () => void = () => {},
  history = new History(storageAt(`${HISTORY_PATH}${prefix.split("/").filter(Boolean).at(-1)}/`)),
) {
  const path = (req: BunRequest) => after(req, prefix);
  const query = (req: BunRequest) => new URL(req.url).searchParams;
  const NOT_A_FILE = () => new Response("Not a file", { status: 400 });

  // What was there, kept before it goes. `force` for a delete or a restore.
  const keep = async (key: string, force: boolean) => {
    if (await store.exists(key)) await history.save(key, await store.readBytes(key), force);
  };

  return {
    async GET(req: BunRequest) {
      const denied = await requireAuth(req);
      if (denied) return denied;
      const key = path(req);
      const q = query(req);
      if (q.has("deleted")) {
        if (key && !plainKey(key)) return NOT_A_FILE();
        return Response.json(await history.deleted((k) => store.exists(k), key));
      }
      if (q.has("versions") || q.has("version")) {
        if (!plainKey(key)) return NOT_A_FILE();
        if (q.has("versions")) return Response.json(await history.versions(key));
        const body = await history.read(key, q.get("version")!);
        if (!body) return new Response("No such version", { status: 404 });
        return new Response(Buffer.from(body), { headers: { "Content-Type": store.mime(key) } });
      }
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
      const body = await req.text();
      await keep(key, false);
      await store.write(key, body);
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
      await keep(key, true);
      await store.remove(key);
      changed();
      return Response.json({ ok: true });
    },

    // A version put back. What it replaces is kept first, so a restore is
    // itself something Earlier versions can undo.
    async POST(req: BunRequest) {
      const denied = await requireAuth(req);
      if (denied) return denied;
      const key = path(req);
      const id = query(req).get("restore");
      if (!id || !plainKey(key)) return NOT_A_FILE();
      const body = await history.read(key, id);
      if (!body) return new Response("No such version", { status: 404 });
      await keep(key, true);
      await store.write(key, body);
      changed();
      return Response.json({ ok: true });
    },
  };
}
