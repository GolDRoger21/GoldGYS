#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  argv.forEach((entry) => {
    if (!entry.startsWith("--")) return;
    const [rawKey, rawValue] = entry.slice(2).split("=");
    const key = rawKey.trim();
    const value = (rawValue || "").trim();
    if (value) args[key] = value;
  });
  return args;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const input = args.in;
  if (!input) {
    console.error("Usage: node scripts/encode-e2e-auth-state.cjs --in=tests/e2e/.auth/user.json");
    process.exit(1);
  }

  const target = path.resolve(process.cwd(), input);
  if (!fs.existsSync(target)) {
    console.error(`File not found: ${target}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(target, "utf8").replace(/^\uFEFF/, "");
  try {
    JSON.parse(raw);
  } catch (error) {
    console.error(`Invalid JSON: ${target}`);
    process.exit(1);
  }

  const encoded = Buffer.from(raw, "utf8").toString("base64");
  process.stdout.write(encoded);
}

run();
