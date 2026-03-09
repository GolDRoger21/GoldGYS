#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");

function fail(message) {
  console.error(`[release-headroom] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseThreshold() {
  const arg = process.argv.find((item) => item.startsWith("--min-kb="));
  const raw = arg ? arg.slice("--min-kb=".length).trim() : "1";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    fail(`Invalid --min-kb value: ${raw}`);
  }
  return n;
}

const minKb = parseThreshold();
const statusPath = path.join(RELEASE_DIR, `release-status-${getTodayStamp()}.json`);
if (!fs.existsSync(statusPath)) {
  fail(`Status file not found: ${path.relative(ROOT, statusPath)} (run release:status:export first)`);
}

const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const metrics = [
  { name: "globalTotal", value: Number(status?.budget?.globalTotal?.headroomKb) },
  { name: "globalJs", value: Number(status?.budget?.globalJs?.headroomKb) },
  { name: "globalCss", value: Number(status?.budget?.globalCss?.headroomKb) },
  { name: "globalHtml", value: Number(status?.budget?.globalHtml?.headroomKb) }
];

const invalid = metrics.filter((m) => !Number.isFinite(m.value));
if (invalid.length > 0) {
  fail(`Missing/invalid headroom metrics: ${invalid.map((m) => m.name).join(", ")}`);
}

const low = metrics.filter((m) => m.value < minKb);
if (low.length > 0) {
  fail(`Headroom below ${minKb.toFixed(2)} kB: ${low.map((m) => `${m.name}=${m.value.toFixed(2)}kB`).join(", ")}`);
}

console.log(
  `[release-headroom] PASS (threshold ${minKb.toFixed(2)} kB): ${metrics
    .map((m) => `${m.name}=${m.value.toFixed(2)}kB`)
    .join(", ")}`
);
