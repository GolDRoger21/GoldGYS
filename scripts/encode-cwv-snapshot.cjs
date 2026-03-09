#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function fail(message) {
  console.error(`[encode-cwv-snapshot] ${message}`);
  process.exit(1);
}

function parseInputArg() {
  const arg = process.argv.find((item) => item.startsWith("--in="));
  if (!arg) return path.join(__dirname, "cwv-snapshot.json");
  const value = arg.slice("--in=".length).trim();
  if (!value) return path.join(__dirname, "cwv-snapshot.json");
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

const inputPath = parseInputArg();
if (!fs.existsSync(inputPath)) {
  fail(`Input file not found: ${path.relative(ROOT, inputPath)}`);
}

const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");
try {
  JSON.parse(raw);
} catch (error) {
  fail(`Invalid JSON: ${error.message}`);
}

const encoded = Buffer.from(raw, "utf8").toString("base64");
process.stdout.write(encoded);
