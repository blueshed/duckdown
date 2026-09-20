import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { createImageStorage } from "../storage";
import { IMAGES_PATH } from "../config";
import { after } from "../utils";

const images = createImageStorage();

const THUMB_MIN = 16;
const THUMB_MAX = 256;

export const handleBrowse = {
  async GET(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = after(req, "/edit/browse/");
    const thumb = new URL(req.url).searchParams.get("thumb");

    if (path && (await images.exists(path))) {
      // SVG is vector and already scales cleanly — Bun.Image only decodes
      // raster formats, so it's served as-is rather than resized.
      if (thumb && !path.toLowerCase().endsWith(".svg")) {
        const size = Math.min(Math.max(parseInt(thumb, 10) || THUMB_MIN, THUMB_MIN), THUMB_MAX);
        const bytes = await new Bun.Image(await images.readBytes(path))
          .resize(size, size, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 70 })
          .bytes();
        return new Response(Buffer.from(bytes), {
          headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" },
        });
      }
      return new Response(Buffer.from(await images.readBytes(path)), {
        headers: { "Content-Type": images.mime(path), "Cache-Control": "private, max-age=86400" },
      });
    }

    return Response.json(await images.list(path));
  },

  async PUT(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = after(req, "/edit/browse/");
    if (path) {
      // Create folder by writing a placeholder, then deleting it
      // This ensures the directory exists on disk
      const placeholder = `${path}/.gitkeep`;
      await images.write(placeholder, "");
      return Response.json(await images.list(path));
    }
    return Response.json({ img_path: `/${IMAGES_PATH}` });
  },

  async POST(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    const path = after(req, "/edit/browse/");
    const formData = await req.formData();
    const results: string[] = [];
    for (const [, value] of formData.entries()) {
      if (typeof value !== "string" && "name" in value) {
        const file = value as File;
        const dest = path ? `${path}/${file.name}` : file.name;
        const bytes = new Uint8Array(await file.arrayBuffer());
        await images.write(dest, bytes);
        results.push(`${IMAGES_PATH}${dest}`);
      }
    }
    return Response.json({ result: results });
  },
};
