import type { BunRequest } from "bun";
import { createStorage } from "./storage";
import { USERS_PATH, DEBUG } from "./config";
import { scaffoldNotice } from "./scaffold";
import { readUsers, writeUsers, currentUsers, fingerprint, usersFrom, type Users } from "./users";

const site = createStorage();

export function loadSecret(secret = process.env.COOKIE_SECRET, debug = DEBUG): string {
  if (secret) return secret;
  if (debug) {
    console.warn("COOKIE_SECRET not set — using an insecure development default. Set COOKIE_SECRET before deploying.");
    return "duckie-dev-secret";
  }
  // This is the first thing a new site walks into when `bun create` didn't run
  // setup: no .env means no DEBUG=1, so we refuse to start — over a secret,
  // which is nothing to do with what actually went wrong. Say what did.
  throw new Error("COOKIE_SECRET must be set outside development mode (set DEBUG=1 for local dev instead)." + scaffoldNotice());
}

const SECRET = loadSecret();
const COOKIE_NAME = process.env.COOKIE_NAME || "duckie_token";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// --- JWT (HS256, no dependencies) ---

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${base64url(new Uint8Array(sig))}`;
}

export async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const data = `${parts[0]}.${parts[1]}`;
    const sig = base64urlDecode(parts[2]!);
    const key = await hmacKey();
    const valid = await crypto.subtle.verify("HMAC", key, sig.buffer as ArrayBuffer, new TextEncoder().encode(data));
    if (!valid) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1]!)));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    return payload;
  } catch {
    // Not base64 or not JSON: not a token we issued, so simply signed out
    // (rather than a 500 for whoever carries a mangled cookie).
    return null;
  }
}

// --- Users ---

// A deployment's first user, from the environment. A site seeded from the
// example (or from `bun create`) would otherwise carry that seed's admin onto
// the internet, at a known URL. Set DUCKDOWN_ADMIN_PASSWORD and the user is
// written to users.json at startup, so the secret lives in the platform rather
// than in git; change the variable and the next restart changes the password.
// Nothing happens when it isn't set, which is every local run.
export async function ensureAdmin(
  password = process.env.DUCKDOWN_ADMIN_PASSWORD,
  email = process.env.DUCKDOWN_ADMIN_USER || "admin",
): Promise<boolean> {
  if (!password) return false;
  const users: Users = (await site.exists(USERS_PATH)) ? await readUsers(site) : usersFrom();
  // Already this password: leave the file alone, so a restart isn't a write
  // (on S3 that's a PUT) and the hash doesn't churn.
  if (users[email] && (await Bun.password.verify(password, users[email]))) return false;
  users[email] = await Bun.password.hash(password);
  await writeUsers(users, site);
  console.log(`  admin: ${email} set in ${USERS_PATH} from DUCKDOWN_ADMIN_PASSWORD`);
  return true;
}

// Only allow redirecting to a same-origin path — an absolute or
// protocol-relative `next` would let /login act as an open redirect.
function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return fallback;
}

// --- Public API ---

// Takes any Request: the site's pages are served by the fetch fallback, which
// gets a plain one (no .cookies), and they show an edit link when signed in.
//
// A session is only as good as its user: one who has been removed is signed
// out, and so is a session from before their password last changed (its
// fingerprint no longer matches). A session with no fingerprint was made by
// 0.8 or earlier and stands until it expires. A users.json that can't be read
// signs nobody in — said in the log — rather than taking the site down.
export async function getUser(req: Request): Promise<string | null> {
  const token = new Bun.CookieMap(req.headers.get("cookie") ?? "").get(COOKIE_NAME);
  if (!token) return null;
  const payload = await verifyJwt(token);
  const name = payload?.sub;
  if (typeof name !== "string" || !name) return null;
  let users: Users;
  try {
    users = await currentUsers();
  } catch (e) {
    console.error(`Couldn't read ${USERS_PATH}, so nobody is signed in:`, e);
    return null;
  }
  const hash = users[name];
  if (!hash) return null;
  if (payload!.h !== undefined && payload!.h !== fingerprint(hash)) return null;
  return name;
}

// The cookie that signs `name` in, carrying their hash's fingerprint. Login
// sets it, and so does changing your own password, which would otherwise sign
// you out of the session you changed it in.
export async function sessionCookie(name: string, hash: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: name, iat: now, exp: now + TOKEN_MAX_AGE, h: fingerprint(hash) });
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_MAX_AGE}`;
}

export async function requireAuth(req: BunRequest): Promise<Response | null> {
  const user = await getUser(req);
  if (user) return null;
  // A page load goes to the login form and comes back; the editor's fetches
  // get a 401 to act on (see edit/api.ts), not the login page's HTML.
  if (!req.headers.get("accept")?.includes("text/html")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const next = encodeURIComponent(safeNext(new URL(req.url).pathname));
  return Response.redirect(`/login?next=${next}`, 302);
}

// --- Login page via HTMLRewriter ---

const loginHtml = await Bun.file(import.meta.dir + "/edit/login.html").text();

function renderLogin(status: number, next: string, error?: string, email?: string): Response {
  const res = new Response(loginHtml, { headers: { "Content-Type": "text/html" } });
  const rewritten = new HTMLRewriter()
    .on("#error", {
      element(el) {
        if (error) {
          el.setInnerContent(error);
          el.setAttribute("class", "error");
          el.setAttribute("role", "alert");
        }
      },
    })
    .on("input[name=email]", {
      element(el) {
        if (email) el.setAttribute("value", email);
      },
    })
    .on("input[name=next]", {
      element(el) {
        el.setAttribute("value", next);
      },
    })
    .transform(res);

  return new Response(rewritten.body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// --- Route handlers ---

// Signing in lands in the editor unless `next` says otherwise; already signed
// in, /login goes straight there.
export async function handleLoginGet(req: BunRequest): Promise<Response> {
  const next = safeNext(new URL(req.url).searchParams.get("next"), "/edit");
  if (await getUser(req)) return Response.redirect(next, 302);
  return renderLogin(200, next);
}

export async function handleLoginPost(req: BunRequest): Promise<Response> {
  // A body that isn't a form (a scanner's JSON, say) is a login without an
  // email or a password, not a server error.
  const form = await req.formData().catch(() => new FormData());
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const next = safeNext(form.get("next") as string, "/edit");

  if (!email || !password) {
    return renderLogin(400, next, "Email and password required", email);
  }

  // Read afresh, not from what getUser keeps: signing in is rare, and it is
  // where a file edited by hand is found to be broken.
  let users: Users;
  try {
    users = await readUsers();
  } catch (e) {
    console.error(`Couldn't read ${USERS_PATH}:`, e);
    return renderLogin(500, next, `Sign-in is broken: ${USERS_PATH} can't be read. See the server log.`, email);
  }
  const hash = users[email];
  if (!hash || !(await Bun.password.verify(password, hash))) {
    return renderLogin(401, next, "Invalid email or password", email);
  }

  const res = Response.redirect(next, 302);
  res.headers.append("Set-Cookie", await sessionCookie(email, hash));
  return res;
}

// POST only (see main.ts), and never from another site: browsers label each
// request with Sec-Fetch-Site, so a form elsewhere can't sign you out.
export function handleLogout(req: BunRequest): Response {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return new Response("Cross-site logout refused", { status: 403 });
  }
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const res = Response.redirect(next, 302);
  res.headers.append("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  return res;
}
