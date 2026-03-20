import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, cpSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Subprocess } from "bun";

const testDir = mkdtempSync(join(tmpdir(), "duckie-test-"));
cpSync(join(import.meta.dir, "example"), testDir, { recursive: true });

let proc: Subprocess;
let BASE: string;
let authCookie: string;

beforeAll(async () => {
  proc = Bun.spawn(["bun", "run", join(import.meta.dir, "..", "server", "main.ts")], {
    env: {
      ...process.env,
      DUCKDOWN_PATH: testDir,
      PORT: "0",
      DEBUG: "0",
      COOKIE_SECRET: "test-secret",
    },
    stdout: "pipe",
  });

  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    output += decoder.decode(value);
    const match = output.match(/(?:site|url|edit):\s*(http:\/\/localhost:\d+)/);
    if (match) {
      BASE = match[1];
      reader.releaseLock();
      break;
    }
  }

  // Login to get auth cookie
  const form = new FormData();
  form.set("email", "admin");
  form.set("password", "admin");
  form.set("next", "/");
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    body: form,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const match = setCookie.match(/duckie_token=[^;]+/);
  authCookie = match ? match[0] : "";
});

afterAll(() => {
  proc.kill();
  rmSync(testDir, { recursive: true, force: true });
});

function authed(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: { ...((init?.headers as Record<string, string>) || {}), Cookie: authCookie },
  };
}

// --- Auth ---

describe("auth", () => {
  test("GET /login returns login page", async () => {
    const res = await fetch(`${BASE}/login`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Sign In");
  });

  test("POST /login with valid creds redirects", async () => {
    const form = new FormData();
    form.set("email", "admin");
    form.set("password", "admin");
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      body: form,
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("duckie_token=");
  });

  test("POST /login with bad creds returns 401", async () => {
    const form = new FormData();
    form.set("email", "admin");
    form.set("password", "wrong");
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      body: form,
      redirect: "manual",
    });
    expect(res.status).toBe(401);
    const html = await res.text();
    expect(html).toContain("Invalid");
  });

  test("GET /logout clears cookie", async () => {
    const res = await fetch(`${BASE}/logout`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  test("editor routes require auth", async () => {
    const res = await fetch(`${BASE}/edit/pages/`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/login");
  });

  test("editor routes work with auth", async () => {
    const res = await fetch(`${BASE}/edit/pages/`, authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.files).toBeArray();
  });
});

// --- Editor API (authenticated) ---

describe("editor API", () => {
  describe("GET /edit/pages/*", () => {
    test("lists root folder", async () => {
      const res = await fetch(`${BASE}/edit/pages/`, authed());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.files).toBeArray();
      expect(data.files.some((f: any) => f.name === "index.md")).toBe(true);
    });

    test("returns file content", async () => {
      const res = await fetch(`${BASE}/edit/pages/index.md`, authed());
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("duckdown");
    });

    test("lists missing folder as empty", async () => {
      const res = await fetch(`${BASE}/edit/pages/nonexistent/`, authed());
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.files).toEqual([]);
      expect(data.folders).toEqual([]);
    });
  });

  describe("PUT /edit/pages/*", () => {
    test("creates and saves a file", async () => {
      const content = "title: Test\n\n# Hello from test";
      const res = await fetch(`${BASE}/edit/pages/test-file.md`, authed({
        method: "PUT",
        body: content,
      }));
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);

      const read = await fetch(`${BASE}/edit/pages/test-file.md`, authed());
      expect(await read.text()).toBe(content);
    });

    test("creates nested directories", async () => {
      const res = await fetch(`${BASE}/edit/pages/sub/nested/deep.md`, authed({
        method: "PUT",
        body: "# Deep file",
      }));
      expect(res.status).toBe(200);

      const read = await fetch(`${BASE}/edit/pages/sub/nested/deep.md`, authed());
      expect(await read.text()).toBe("# Deep file");
    });
  });

  describe("DELETE /edit/pages/*", () => {
    test("deletes an existing file", async () => {
      await fetch(`${BASE}/edit/pages/to-delete.md`, authed({
        method: "PUT",
        body: "delete me",
      }));

      const res = await fetch(`${BASE}/edit/pages/to-delete.md`, authed({
        method: "DELETE",
      }));
      expect(res.status).toBe(200);
    });

    test("returns 404 for missing file", async () => {
      const res = await fetch(`${BASE}/edit/pages/does-not-exist.md`, authed({
        method: "DELETE",
      }));
      expect(res.status).toBe(404);
    });
  });
});

describe("markdown preview", () => {
  test("renders markdown to HTML", async () => {
    const res = await fetch(`${BASE}/edit/mark/`, authed({
      method: "PUT",
      body: "# Hello\n\nWorld",
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.content).toContain("<h1>");
    expect(data.content).toContain("Hello");
  });

  test("parses front-matter", async () => {
    const res = await fetch(`${BASE}/edit/mark/`, authed({
      method: "PUT",
      body: "title: My Page\ntheme: dark\n\n# Content",
    }));
    const data = await res.json();
    expect(data.meta.title).toEqual(["My Page"]);
    expect(data.meta.theme).toEqual(["dark"]);
    expect(data.content).not.toContain("title:");
  });

  test("handles GFM tables", async () => {
    const res = await fetch(`${BASE}/edit/mark/`, authed({
      method: "PUT",
      body: "| a | b |\n|---|---|\n| 1 | 2 |",
    }));
    const data = await res.json();
    expect(data.content).toContain("<table>");
  });
});

describe("image browser", () => {
  test("lists images folder", async () => {
    const res = await fetch(`${BASE}/edit/browse/`, authed());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.files).toBeArray();
    expect(data.files.some((f: any) => f.name === "logo.svg")).toBe(true);
  });

  test("returns image path", async () => {
    const res = await fetch(`${BASE}/edit/browse/`, authed({ method: "PUT" }));
    const data = await res.json();
    expect(data.img_path).toContain("images");
  });
});

// --- Public routes (no auth needed) ---

describe("static files", () => {
  test("serves CSS", async () => {
    const res = await fetch(`${BASE}/static/site.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  test("serves images", async () => {
    const res = await fetch(`${BASE}/static/images/logo.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("svg");
  });

  test("returns 404 for missing file", async () => {
    const res = await fetch(`${BASE}/static/nope.txt`);
    expect(res.status).toBe(404);
  });
});

describe("site rendering", () => {
  test("renders index page", async () => {
    const res = await fetch(`${BASE}/index.html`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>duckdown</title>");
  });

  test("returns 404 for missing page", async () => {
    const res = await fetch(`${BASE}/no-such-page.html`);
    expect(res.status).toBe(404);
  });
});

describe("path traversal", () => {
  test("blocks traversal in pages", async () => {
    const res = await fetch(`${BASE}/edit/pages/../../../etc/passwd`, authed({ redirect: "manual" }));
    expect([404, 500]).toContain(res.status);
  });

  test("blocks traversal in static", async () => {
    const res = await fetch(`${BASE}/static/../../../etc/passwd`);
    expect([404, 500]).toContain(res.status);
  });
});
