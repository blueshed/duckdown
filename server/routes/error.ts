import { DEBUG } from "../config";
import { BadRequest } from "../utils";

// Failures speak: whatever a handler throws is logged, and answered with a
// line the editor can show (the detail only in development).
export function handleError(error: Error): Response {
  if (error instanceof BadRequest) return new Response("Bad Request", { status: 400 });
  console.error(error);
  return new Response(DEBUG ? `Server error: ${error.message}` : "Server error", { status: 500 });
}
