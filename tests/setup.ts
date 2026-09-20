// Test preload (bunfig.toml): runs before any test file, so every module sees
// this configuration when it first reads process.env.
import { afterAll } from "bun:test";
import { mkdtempSync, cpSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The server under test runs in this process on a scratch copy of the seed
// site, with its own pid file (./duckdown.pid belongs to any dev server).
const site = mkdtempSync(join(tmpdir(), "duckie-site-"));
cpSync(join(import.meta.dir, "example"), site, { recursive: true });
const run = mkdtempSync(join(tmpdir(), "duckie-run-"));

Object.assign(process.env, {
  DUCKDOWN_PATH: site,
  DUCKDOWN_PID: join(run, "duckdown.pid"),
  DUCKIE_TEST_RUN: run,
  PORT: "0",
  DEBUG: "0",
  COOKIE_SECRET: "test-secret",
});
// .env may point these at the dev site or a bucket; tests set their own.
delete process.env.DUCKDOWN_SEED;
delete process.env.DUCKDOWN_BUCKET;

// A DOM for the editor's code. happy-dom brings its own fetch, Response,
// timers and so on; the server in this process needs Bun's, so put them back.
const natives = [
  "fetch", "Request", "Response", "Headers", "FormData", "Blob", "File", "URL", "URLSearchParams",
  "AbortController", "AbortSignal", "TextEncoder", "TextDecoder", "ReadableStream", "WritableStream",
  "TransformStream", "WebSocket", "crypto", "performance", "setTimeout", "clearTimeout",
  "setInterval", "clearInterval", "queueMicrotask", "structuredClone", "atob", "btoa", "console",
] as const;
const saved = Object.fromEntries(natives.map((k) => [k, (globalThis as any)[k]]));
GlobalRegistrator.register({
  url: "http://localhost/edit",
  settings: {
    disableJavaScriptFileLoading: true,
    disableCSSFileLoading: true,
    disableIframePageLoading: true,
    navigation: { disableMainFrameNavigation: true, disableChildFrameNavigation: true },
  },
});
Object.assign(globalThis, saved);

afterAll(() => {
  rmSync(site, { recursive: true, force: true });
  rmSync(run, { recursive: true, force: true });
});
