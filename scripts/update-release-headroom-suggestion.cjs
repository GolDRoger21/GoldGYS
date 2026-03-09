#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");
const HISTORY_PATH = path.join(RELEASE_DIR, "release-history.json");
const OUTPUT_PATH = path.join(RELEASE_DIR, "release-headroom-suggestion.json");

function fail(message) {
  console.error(`[release-headroom-suggest] ${message}`);
  process.exit(1);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function parseTopRiskHeadroom(line) {
  const m = String(line || "").match(/\(([0-9]+(?:\.[0-9]+)?)\s*kB headroom\)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

if (!fs.existsSync(RELEASE_DIR)) {
  fail(`Release directory not found: ${RELEASE_DIR}`);
}

const history = readJson(HISTORY_PATH);
if (!history || !Array.isArray(history.entries) || history.entries.length === 0) {
  fail(`History not found or empty: ${path.relative(ROOT, HISTORY_PATH)}`);
}

const latestEntries = [...history.entries].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
const globalSamples = [];
const riskSamples = [];

for (const entry of latestEntries) {
  const heads = entry?.budgetHeadroomKb || {};
  const localMin = [heads.total, heads.js, heads.css, heads.html]
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b)[0];
  if (Number.isFinite(localMin)) globalSamples.push(localMin);

  const statusPath = path.join(RELEASE_DIR, `release-status-${entry.date}.json`);
  const status = readJson(statusPath);
  const topRisk = Array.isArray(status?.budget?.riskTop3) ? status.budget.riskTop3[0] : null;
  const riskValue = parseTopRiskHeadroom(topRisk);
  if (Number.isFinite(riskValue)) riskSamples.push(riskValue);
}

if (globalSamples.length === 0) {
  fail("No valid global headroom samples found.");
}
if (riskSamples.length === 0) {
  fail("No valid top-risk headroom samples found.");
}

const minGlobal = Math.min(...globalSamples);
const minRisk = Math.min(...riskSamples);

const suggestedGlobal = round2(clamp(minGlobal * 0.8, 0.5, 5));
const suggestedRisk = round2(clamp(minRisk * 0.8, 0.5, 5));

const payload = {
  generatedAt: new Date().toISOString(),
  sampleWindow: latestEntries.length,
  samples: {
    globalCount: globalSamples.length,
    riskCount: riskSamples.length
  },
  observed: {
    minGlobalHeadroomKb: round2(minGlobal),
    minTopRiskHeadroomKb: round2(minRisk)
  },
  suggested: {
    minGlobalHeadroomKb: suggestedGlobal,
    minRiskHeadroomKb: suggestedRisk
  }
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[release-headroom-suggest] Updated: ${path.relative(ROOT, OUTPUT_PATH)}`);
