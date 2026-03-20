import type { BunRequest } from "bun";
import { createStorage } from "./storage";
import { USERS_PATH } from "./config";

const site = createStorage();

const SECRET = process.env.COOKIE_SECRET || "duckie-dev-secret";
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

async function signJwt(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return `${data}.${base64url(new Uint8Array(sig))}`;
}

async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const data = `${parts[0]}.${parts[1]}`;
  const sig = base64urlDecode(parts[2]);
  const key = await hmacKey();
  const valid = await crypto.subtle.verify("HMAC", key, sig.buffer as ArrayBuffer, new TextEncoder().encode(data));
  if (!valid) return null;

  const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;

  return payload;
}

// --- Users ---

async function loadUsers(): Promise<Record<string, string>> {
  try {
    const raw = await site.read(USERS_PATH);
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// --- Public API ---

export async function getUser(req: BunRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME);
  if (!token) return null;
  const payload = await verifyJwt(token);
  return (payload?.sub as string) || null;
}

export async function requireAuth(req: BunRequest): Promise<Response | null> {
  const user = await getUser(req);
  if (user) return null;
  const next = encodeURIComponent(new URL(req.url).pathname);
  return Response.redirect(`/login?next=${next}`, 302);
}

// --- Login page via HTMLRewriter ---

const loginHtml = await Bun.file(import.meta.dir + "/edit/login.html").text();

function renderLogin(status: number, error?: string, email?: string, next?: string): Response {
  const res = new Response(loginHtml, { headers: { "Content-Type": "text/html" } });
  const rewritten = new HTMLRewriter()
    .on("#error", {
      element(el) {
        if (error) {
          el.setInnerContent(error);
          el.setAttribute("class", "error");
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
        el.setAttribute("value", next || "/");
      },
    })
    .transform(res);

  return new Response(rewritten.body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// --- Route handlers ---

export async function handleLoginGet(req: BunRequest): Promise<Response> {
  const next = new URL(req.url).searchParams.get("next") || "/";
  return renderLogin(200, undefined, undefined, next);
}

export async function handleLoginPost(req: BunRequest): Promise<Response> {
  const form = await req.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;
  const next = (form.get("next") as string) || "/";

  if (!email || !password) {
    return renderLogin(400, "Email and password required", email, next);
  }

  const users = await loadUsers();
  if (users[email] !== password) {
    return renderLogin(401, "Invalid email or password", email, next);
  }

  const token = await signJwt({
    sub: email,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_MAX_AGE,
  });

  const res = Response.redirect(next, 302);
  res.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_MAX_AGE}`,
  );
  return res;
}

export function handleLogout(req: BunRequest): Response {
  const next = new URL(req.url).searchParams.get("next") || "/";
  const res = Response.redirect(next, 302);
  res.headers.append("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0`);
  return res;
}
