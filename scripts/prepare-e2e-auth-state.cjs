#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.resolve(process.cwd(), "tests/e2e/.auth");

function writeIfProvided(base64Value, fileName) {
  if (!base64Value) return false;
  const target = path.join(OUT_DIR, fileName);
  const decoded = Buffer.from(base64Value, "base64").toString("utf8");

  try {
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("decoded payload is not a JSON object");
    }
  } catch (error) {
    throw new Error(`${fileName} is not valid JSON: ${error.message}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(target, decoded, "utf8");
  return true;
}

function run() {
  const userWritten = writeIfProvided(process.env.E2E_AUTH_STORAGE_STATE_B64, "user.json");
  const adminWritten = writeIfProvided(process.env.E2E_ADMIN_AUTH_STORAGE_STATE_B64, "admin.json");

  if (!userWritten && !adminWritten) {
    console.log("[e2e-auth-prepare] No base64 auth state env vars provided. Skipping.");
    return;
  }

  console.log(
    `[e2e-auth-prepare] Prepared auth state files: user=${userWritten ? "yes" : "no"}, admin=${adminWritten ? "yes" : "no"}`
  );
}

try {
  run();
} catch (error) {
  console.error("[e2e-auth-prepare] Failed:", error.message);
  process.exit(1);
}
