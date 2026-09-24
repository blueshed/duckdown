import type { BunRequest } from "bun";
import { requireAuth, getUser, sessionCookie } from "../auth";
import { readUsers, writeUsers, nameProblem, passwordProblem, envAdmin } from "../users";

// /edit/users — who can sign in, for whoever is signed in. Every editor is
// equal: any of them may add one, set a password, or remove one. What it
// answers is names; a hash never leaves users.json.
//
// Two refusals keep a site from locking itself out: you can't remove
// yourself (ask another editor, so there is always someone), and the user
// DUCKDOWN_ADMIN_PASSWORD sets can't be changed or removed here, because
// the next restart would put them back as the environment says.

const said = (status: number, why: string) => new Response(why, { status });

type Body = { name?: unknown; password?: unknown; current?: unknown };

// A write never comes from another site: browsers label each request with
// Sec-Fetch-Site, so a page elsewhere can't add itself an editor.
async function editor(req: BunRequest): Promise<Response | string> {
  const denied = await requireAuth(req);
  if (denied) return denied;
  if (req.method !== "GET" && req.headers.get("sec-fetch-site") === "cross-site") {
    return said(403, "Cross-site change refused");
  }
  return (await getUser(req))!;
}

const body = async (req: BunRequest): Promise<Body> => req.json().catch(() => ({})) as Promise<Body>;

export const handleUsers = {
  async GET(req: BunRequest) {
    const me = await editor(req);
    if (me instanceof Response) return me;
    const env = envAdmin();
    const users = Object.keys(await readUsers()).sort().map((name) => ({ name, env: name === env }));
    return Response.json({ me, users });
  },

  // A new editor, with the password they will sign in with.
  async POST(req: BunRequest) {
    const me = await editor(req);
    if (me instanceof Response) return me;
    const { name, password } = await body(req);
    const problem = nameProblem(name) ?? passwordProblem(password);
    if (problem) return said(400, problem);
    const users = await readUsers();
    if (users[name as string]) return said(409, `${name} can already sign in`);
    users[name as string] = await Bun.password.hash(password as string);
    await writeUsers(users);
    return Response.json({ ok: true });
  },

  // A new password: for anyone, or for yourself with the one you have now.
  // Every session its user had ends; yours is signed in again in the answer.
  async PUT(req: BunRequest) {
    const me = await editor(req);
    if (me instanceof Response) return me;
    const { name, password, current } = await body(req);
    const problem = passwordProblem(password);
    if (problem) return said(400, problem);
    const users = await readUsers();
    const hash = users[name as string];
    if (typeof name !== "string" || !hash) return said(404, `No one called ${String(name)} can sign in`);
    if (name === envAdmin()) return said(409, `${name}'s password is set by DUCKDOWN_ADMIN_PASSWORD: change it there`);
    if (name === me && !(typeof current === "string" && await Bun.password.verify(current, hash))) {
      return said(403, "That isn't your current password");
    }
    users[name] = await Bun.password.hash(password as string);
    await writeUsers(users);
    const res = Response.json({ ok: true });
    if (name === me) res.headers.append("Set-Cookie", await sessionCookie(name, users[name]!));
    return res;
  },

  // Gone: they can't sign in, and any session they had ends.
  async DELETE(req: BunRequest) {
    const me = await editor(req);
    if (me instanceof Response) return me;
    const name = new URL(req.url).searchParams.get("name") ?? "";
    const users = await readUsers();
    if (!users[name]) return said(404, `No one called ${name} can sign in`);
    if (name === me) return said(409, "You can't remove yourself: ask another editor");
    if (name === envAdmin()) return said(409, `${name} is set by DUCKDOWN_ADMIN_PASSWORD: take it out there`);
    delete users[name];
    await writeUsers(users);
    return Response.json({ ok: true });
  },
};
