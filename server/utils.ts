import type { BunRequest } from "bun";

// Extract wildcard path from URL by stripping the route prefix
export function after(req: BunRequest, prefix: string): string {
  return new URL(req.url).pathname.slice(prefix.length);
}
