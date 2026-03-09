#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");
const SUGGESTION_PATH = path.join(RELEASE_DIR, "release-headroom-suggestion.json");

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

function readSuggestion() {
  if (!fs.existsSync(SUGGESTION_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SUGGESTION_PATH, "utf8"));
  } catch {
    return null;
  }
}

function parseThreshold(raw, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    fail(`Invalid threshold value: ${raw}`);
  }
  return Number.isFinite(n) ? n : fallback;
}

function parseRawGlobalThreshold() {
  const arg = process.argv.find((item) => item.startsWith("--min-kb="));
  return arg ? arg.slice("--min-kb=".length).trim() : "1";
}

function parseRawRiskThreshold() {
  const arg = process.argv.find((item) => item.startsWith("--min-risk-kb="));
  return arg ? arg.slice("--min-risk-kb=".length).trim() : "0.75";
}

function parseRiskHeadroom(line) {
  const m = String(line || "").match(/\(([0-9]+(?:\.[0-9]+)?)\s*kB headroom\)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

const suggestion = readSuggestion();
const suggestedGlobal = Number(suggestion?.suggested?.minGlobalHeadroomKb);
const suggestedRisk = Number(suggestion?.suggested?.minRiskHeadroomKb);
const rawMinKb = parseRawGlobalThreshold();
const rawMinRiskKb = parseRawRiskThreshold();

const minKb = rawMinKb.toLowerCase() === "auto"
  ? parseThreshold(String(Number.isFinite(suggestedGlobal) ? suggestedGlobal : 1), 1)
  : parseThreshold(rawMinKb, 1);
const minRiskKb = rawMinRiskKb.toLowerCase() === "auto"
  ? parseThreshold(String(Number.isFinite(suggestedRisk) ? suggestedRisk : 0.75), 0.75)
  : parseThreshold(rawMinRiskKb, 0.75);
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

const topRisk = Array.isArray(status?.budget?.riskTop3) ? status.budget.riskTop3[0] : null;
const topRiskHeadroom = parseRiskHeadroom(topRisk);
if (!Number.isFinite(topRiskHeadroom)) {
  fail("Top risk headroom could not be parsed from release-status budget.riskTop3[0].");
}
if (topRiskHeadroom < minRiskKb) {
  fail(`Top risk headroom below ${minRiskKb.toFixed(2)} kB: ${topRiskHeadroom.toFixed(2)} kB (${topRisk})`);
}

console.log(
  `[release-headroom] PASS (global ${minKb.toFixed(2)} kB, top-risk ${minRiskKb.toFixed(2)} kB): ${metrics
    .map((m) => `${m.name}=${m.value.toFixed(2)}kB`)
    .join(", ")} | topRisk=${topRiskHeadroom.toFixed(2)}kB`
);
