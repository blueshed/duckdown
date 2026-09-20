// Shared by the test files: the one server under test (in this process, so
// its code counts towards coverage), and a signed-in cookie for it.
import { server } from "../server/main";

export const BASE = server.url.href.replace(/\/$/, "");
export const SITE = process.env.DUCKDOWN_PATH!;
export const RUN = process.env.DUCKIE_TEST_RUN!;

let cookie = "";

// Sign in as the seed site's admin, once.
export async function signIn(): Promise<string> {
  if (cookie) return cookie;
  const form = new FormData();
  form.set("email", "admin");
  form.set("password", "admin");
  const res = await fetch(`${BASE}/login`, { method: "POST", body: form, redirect: "manual" });
  cookie = res.headers.get("set-cookie")!.match(/duckie_token=[^;]+/)![0];
  return cookie;
}

export function authed(init: RequestInit = {}): RequestInit {
  return { ...init, headers: { ...(init.headers as Record<string, string>), Cookie: cookie } };
}

// Poll until check() passes (or fail after timeout ms), for async UI.
export async function waitFor(check: () => unknown, timeout = 2000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeout) throw new Error(`waitFor timed out: ${check}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
