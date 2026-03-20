import type { BunRequest } from "bun";
import { requireAuth } from "../auth";
import { createImageStorage } from "../storage";
import { IMAGES_PATH } from "../config";
import { after } from "../utils";

const images = createImageStorage();

export const handleBrowse = {
  async GET(req: BunRequest) {
    const denied = await requireAuth(req);
    if (denied) return denied;
    return Response.json(await images.list(after(req, "/edit/browse/")));
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
