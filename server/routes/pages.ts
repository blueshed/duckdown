import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { createPageStorage } from "../storage";
import { after } from "../utils";
import { pagesChanged } from "../nav";

const pages = createPageStorage();

export const handlePages = {
  async GET(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = after(req, "/edit/pages/");
    if (path && await pages.exists(path)) {
      return new Response(await pages.read(path), {
        headers: { "Content-Type": pages.mime(path) },
      });
    }
    // A missing page is a 404, not an empty folder listing in its place
    // (which the editor would open as the page's text).
    if (/\.(md|css)$/.test(path)) return new Response("Not Found", { status: 404 });
    return Response.json(await pages.list(path));
  },

  async PUT(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = after(req, "/edit/pages/");
    // If-None-Match: * is a create-only write (the editor's New): never
    // replace a file that is already there.
    if (req.headers.get("if-none-match") === "*" && await pages.exists(path)) {
      return new Response("Already exists", { status: 412 });
    }
    await pages.write(path, await req.text());
    pagesChanged();
    return Response.json({ ok: true });
  },

  async DELETE(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = after(req, "/edit/pages/");
    if (!await pages.exists(path)) {
      return new Response("Not Found", { status: 404 });
    }
    await pages.remove(path);
    pagesChanged();
    return Response.json({ ok: true });
  },
};
