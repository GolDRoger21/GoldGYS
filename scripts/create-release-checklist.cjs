#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TEMPLATE = path.join(ROOT, "docs", "release-checklist.md");
const OUTPUT_DIR = path.join(ROOT, "docs", "releases");
const FORCE = process.argv.includes("--force");

function fail(message) {
  console.error(`[release-checklist] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

if (!fs.existsSync(TEMPLATE)) {
  fail(`Template not found: ${TEMPLATE}`);
}

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const stamp = getTodayStamp();
const outputPath = path.join(OUTPUT_DIR, `release-checklist-${stamp}.md`);

if (fs.existsSync(outputPath) && !FORCE) {
  console.log(`[release-checklist] Already exists: ${path.relative(ROOT, outputPath)}`);
  console.log("[release-checklist] Use --force to overwrite.");
  process.exit(0);
}

const template = fs.readFileSync(TEMPLATE, "utf8");
const prefill = template
  .replace("- Tarih:", `- Tarih: ${stamp}`)
  .replace("- Commit:", "- Commit: ")
  .replace("- Surum etiketi:", "- Surum etiketi: ");

fs.writeFileSync(outputPath, prefill, "utf8");
console.log(`[release-checklist] Generated: ${path.relative(ROOT, outputPath)}`);
