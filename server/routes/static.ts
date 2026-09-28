import type { BunRequest } from "bun";
import { createStaticStorage } from "../storage";
import { DEBUG } from "../config";
import { baseFile } from "../base";
import { after, conditional } from "../utils";
import { asFile } from "../headers";

const staticFiles = createStaticStorage();

// A short cache, with validators: a stylesheet edited this morning shows up,
// and a browser that has the file already isn't sent it again. In development
// it asks every time.
export const CACHE = DEBUG ? "no-cache" : "public, max-age=300";

// The site's own file, else duckdown's base file of that name, else null:
// as a file, never a page (headers.ts).
export async function staticFile(req: Request, path: string): Promise<Response | null> {
  const headers = { "Content-Type": staticFiles.mime(path), "Cache-Control": CACHE, ...asFile(staticFiles.mime(path)) };
  if (await staticFiles.exists(path)) return conditional(req, await staticFiles.readBytes(path), headers);
  const base = baseFile(path);
  if (!base) return null;
  return conditional(req, new Uint8Array(await base.arrayBuffer()), headers);
}

export const handleStatic = async (req: BunRequest) =>
  await staticFile(req, after(req, "/static/")) ?? new Response("Not Found", { status: 404 });
