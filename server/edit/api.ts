import { speak } from "./notice";

// Every editor request goes through api(), and no failure is silent. Signed
// out (401), the page goes to the login form and comes back. Anything else
// that isn't ok speaks, naming what was being attempted ("save hello.md"),
// unless the caller handles that status itself (allow). A request that never
// reaches the server resolves to Response.error() (ok: false), so callers just
// check res.ok and never need a catch.
export async function api(what: string, url: string, init?: RequestInit, allow: number[] = []): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    speak(`Couldn't ${what}: the server didn't answer.`);
    return Response.error();
  }
  if (res.status === 401) {
    location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    // Park the caller while the page navigates away, rather than hand it a
    // response it would misread.
    return new Promise<Response>(() => {});
  }
  if (!res.ok && !allow.includes(res.status)) {
    const detail = (await res.clone().text()).trim().split("\n")[0]!.slice(0, 200);
    speak(`Couldn't ${what}: ${res.status} ${detail || res.statusText}`);
  }
  return res;
}

// A storage path as a URL path: each segment encoded ("About us.md" →
// "About%20us.md", a "#" or "?" in a name kept), the slashes kept.
export const urlPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

// api() for a JSON answer: the parsed body, or null once the failure has spoken.
export async function apiJson<T>(what: string, url: string, init?: RequestInit): Promise<T | null> {
  const res = await api(what, url, init);
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    speak(`Couldn't ${what}: the answer wasn't JSON.`);
    return null;
  }
}
