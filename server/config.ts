import { resolve } from "path";

// Storage mode: "local" or "s3"
// Detected from DUCKDOWN_BUCKET — if set, use S3; otherwise, local filesystem.

export const PORT = parseInt(process.env.PORT || "8080");
export const DEBUG = process.env.DEBUG === "1";

// S3 storage
export const BUCKET = process.env.DUCKDOWN_BUCKET || "";
export const BUCKET_PREFIX = process.env.DUCKDOWN_PREFIX || "";
export const BUCKET_ENDPOINT = process.env.DUCKDOWN_ENDPOINT || "";
export const BUCKET_REGION = process.env.DUCKDOWN_REGION || "us-east-1";

// Local storage
export const APP_PATH = resolve(process.env.DUCKDOWN_PATH || "./tests/example");

// Derived paths (shared layout regardless of backend)
export const PAGE_PATH = "pages/";
export const STATIC_PATH = "static/";
export const IMAGES_PATH = "static/images/";
export const TEMPLATES_PATH = "templates/";
export const USERS_PATH = "users.json";

export const IS_S3 = BUCKET !== "";

export function printConfig() {
  console.log(`duckie`);
  if (IS_S3) {
    console.log(`  storage: s3://${BUCKET}/${BUCKET_PREFIX}`);
    if (BUCKET_ENDPOINT) console.log(`  endpoint: ${BUCKET_ENDPOINT}`);
  } else {
    console.log(`  storage: ${APP_PATH}`);
  }
  console.log(`  mode: ${DEBUG ? "development" : "production"}`);
}
