import type { BunRequest } from "bun";
import { createStaticStorage } from "../storage";
import { DEBUG } from "../config";
import { baseFile } from "../base";
import { after, conditional } from "../utils";

const staticFiles = createStaticStorage();

// A short cache, with validators: a stylesheet edited this morning shows up,
// and a browser that has the file already isn't sent it again. In development
// it asks every time.
export const CACHE = DEBUG ? "no-cache" : "public, max-age=300";

// The site's own file, else duckdown's base file of that name, else null.
export async function staticFile(req: Request, path: string): Promise<Response | null> {
  if (await staticFiles.exists(path)) {
    return conditional(req, await staticFiles.readBytes(path), {
      "Content-Type": staticFiles.mime(path), "Cache-Control": CACHE,
    });
  }
  const base = baseFile(path);
  if (!base) return null;
  return conditional(req, new Uint8Array(await base.arrayBuffer()), {
    "Content-Type": staticFiles.mime(path), "Cache-Control": CACHE,
  });
}

export const handleStatic = async (req: BunRequest) =>
  await staticFile(req, after(req, "/static/")) ?? new Response("Not Found", { status: 404 });
