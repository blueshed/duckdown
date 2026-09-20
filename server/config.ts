import { resolve } from "path";

// Storage mode: "local" or "s3"
// Detected from DUCKDOWN_BUCKET — if set, use S3; otherwise, local filesystem.

export const PORT = parseInt(process.env.PORT || "8080");
export const DEBUG = process.env.DEBUG === "1";
// A line per page view on stdout (DUCKDOWN_LOG=1). What is read and how much,
// never who: no address, no user agent, no cookie. Off unless asked for.
export const LOG_VIEWS = process.env.DUCKDOWN_LOG === "1";

// S3 storage
export const BUCKET = process.env.DUCKDOWN_BUCKET || "";
export const BUCKET_PREFIX = process.env.DUCKDOWN_PREFIX || "";
export const BUCKET_ENDPOINT = process.env.DUCKDOWN_ENDPOINT || "";
export const BUCKET_REGION = process.env.DUCKDOWN_REGION || "us-east-1";

// Local storage
export const APP_PATH = resolve(process.env.DUCKDOWN_PATH || "./tests/example");
// Local dev: if APP_PATH doesn't exist yet, start it as a copy of this seed
// site, so editing never touches the seed (e.g. DUCKDOWN_SEED=./tests/example).
export const SEED_PATH = process.env.DUCKDOWN_SEED ? resolve(process.env.DUCKDOWN_SEED) : "";

// Pid file, written at startup and removed on exit. DUCKDOWN_PID= (empty) turns it off.
export const PID_FILE = process.env.DUCKDOWN_PID === "" ? "" : resolve(process.env.DUCKDOWN_PID || "duckdown.pid");

// Derived paths (shared layout regardless of backend)
export const PAGE_PATH = "pages/";
export const STATIC_PATH = "static/";
export const IMAGES_PATH = "static/images/";
export const TEMPLATES_PATH = "templates/";
export const USERS_PATH = "users.json";

export const IS_S3 = BUCKET !== "";

const running = {
  s3: IS_S3, bucket: BUCKET, prefix: BUCKET_PREFIX, endpoint: BUCKET_ENDPOINT,
  path: APP_PATH, debug: DEBUG, pidFile: PID_FILE, pid: process.pid,
};

// The startup banner's lines, for this configuration or any other.
export function configLines(c: typeof running = running): string[] {
  const lines = ["duckie"];
  if (c.s3) {
    lines.push(`  storage: s3://${c.bucket}/${c.prefix}`);
    if (c.endpoint) lines.push(`  endpoint: ${c.endpoint}`);
  } else {
    lines.push(`  storage: ${c.path}`);
  }
  lines.push(`  mode: ${c.debug ? "development" : "production"}`);
  if (c.pidFile) lines.push(`  pid: ${c.pid} (${c.pidFile})`);
  return lines;
}

export function printConfig() {
  for (const line of configLines()) console.log(line);
}
