// Real processes, for what only a process shows: the pid file as a lock, its
// removal on SIGTERM, and seeding before the first request. (The same code is
// covered in-process by units.test.ts; a subprocess doesn't report coverage.)
import { describe, test, expect, spyOn } from "bun:test";
import { join } from "path";
import type { Subprocess } from "bun";
import { RUN } from "./helpers"; // also starts the in-process server, which holds DUCKDOWN_PID
import { stopServer } from "../server/pid";

const SERVER = join(import.meta.dir, "..", "server", "main.ts");

function spawn(env: Record<string, string>) {
  return Bun.spawn(["bun", "run", SERVER], { env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
}

// Wait for the line announcing the server's URL.
async function listening(server: Subprocess): Promise<string> {
  const reader = (server.stdout as ReadableStream<Uint8Array>).getReader();
  let output = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`server exited before listening:\n${output}`);
    output += new TextDecoder().decode(value);
    const match = output.match(/site:\s*(http:\/\/localhost:\d+)/);
    if (match) {
      reader.releaseLock();
      return match[1]!;
    }
  }
}

describe("pid file", () => {
  test("a second server refuses while the first really is running", async () => {
    const pidFile = join(RUN, "two-servers.pid");
    const first = spawn({ DUCKDOWN_PID: pidFile });
    await listening(first);
    try {
      const second = spawn({ DUCKDOWN_PID: pidFile });
      expect(await second.exited).toBe(1);
      expect(await new Response(second.stderr).text()).toContain(`already running as pid ${first.pid}`);
    } finally {
      first.kill();
      await first.exited;
    }
  });

  test("a pid file left by a hard kill doesn't block the restart", async () => {
    // On a mounted volume the file survives SIGKILL, and its number has since
    // been handed to something else. Here that's this test runner: alive, so
    // liveness alone would refuse the start for good.
    const pidFile = join(RUN, "recycled.pid");
    await Bun.write(pidFile, `${process.pid}\n`);
    const server = spawn({ DUCKDOWN_PID: pidFile });
    try {
      await listening(server);
      expect((await Bun.file(pidFile).text()).trim()).toBe(String(server.pid));
    } finally {
      server.kill();
      await server.exited;
    }
  });

  test("bun run stop stops a real server, which takes its pid file with it", async () => {
    const pidFile = join(RUN, "stop-real.pid");
    const server = spawn({ DUCKDOWN_PID: pidFile });
    await listening(server);
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await stopServer(pidFile)).toBe(0);
      expect(log).toHaveBeenCalledWith(`Stopped duckie (pid ${server.pid}).`);
    } finally {
      log.mockRestore();
    }
    expect(await server.exited).toBe(143);
    expect(await Bun.file(pidFile).exists()).toBe(false);
  });

  test("is removed when the server stops", async () => {
    const pidFile = join(RUN, "stops.pid");
    const server = spawn({ DUCKDOWN_PID: pidFile });
    await listening(server);
    expect((await Bun.file(pidFile).text()).trim()).toBe(String(server.pid));
    server.kill(); // SIGTERM
    expect(await server.exited).toBe(143);
    expect(await Bun.file(pidFile).exists()).toBe(false);
  });
});

describe("dev seed", () => {
  test("a missing DUCKDOWN_PATH starts as a copy of DUCKDOWN_SEED", async () => {
    const site = join(RUN, "seeded-site");
    const server = spawn({ DUCKDOWN_PATH: site, DUCKDOWN_SEED: join(import.meta.dir, "example"), DUCKDOWN_PID: "" });
    try {
      const base = await listening(server);
      expect(await Bun.file(join(site, "pages", "index.md")).exists()).toBe(true);
      expect(await (await fetch(`${base}/index.html`)).text()).toContain("Welcome to duckdown");
    } finally {
      server.kill();
      await server.exited;
    }
  });
});
