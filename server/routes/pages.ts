import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { createPageStorage } from "../storage";
import { after } from "../utils";

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
    return Response.json(await pages.list(path));
  },

  async PUT(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    await pages.write(after(req, "/edit/pages/"), await req.text());
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
    return Response.json({ ok: true });
  },
};
