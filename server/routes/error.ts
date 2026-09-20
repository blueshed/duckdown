import { DEBUG } from "../config";

// Failures speak: whatever a handler throws is logged, and answered with a
// line the editor can show (the detail only in development).
export function handleError(error: Error): Response {
  console.error(error);
  return new Response(DEBUG ? `Server error: ${error.message}` : "Server error", { status: 500 });
}
