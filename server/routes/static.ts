import type { BunRequest } from "bun";
import { createStaticStorage } from "../storage";
import { after } from "../utils";

const staticFiles = createStaticStorage();

export const handleStatic = async (req: BunRequest) => {
  const path = after(req, "/static/");
  if (!await staticFiles.exists(path)) {
    return new Response("Not Found", { status: 404 });
  }
  const bytes = await staticFiles.readBytes(path);
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": staticFiles.mime(path) },
  });
};
