#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");
const SNAPSHOT_FILE = path.join(__dirname, "cwv-snapshot.json");

function fail(message) {
  console.error(`[release-checklist-cwv] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readSnapshot() {
  if (!fs.existsSync(SNAPSHOT_FILE)) return null;
  try {
    const raw = fs.readFileSync(SNAPSHOT_FILE, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setLine(lines, matcher, next) {
  const idx = lines.findIndex((line) => matcher(line));
  if (idx === -1) return;
  const indent = lines[idx].match(/^\s*/)?.[0] || "";
  lines[idx] = `${indent}${next}`;
}

function metricValue(snapshot, section, key, metric) {
  const value = snapshot?.[section]?.[key]?.[metric];
  if (value === null || value === undefined || value === "") return "PENDING";
  return String(value);
}

if (!fs.existsSync(RELEASE_DIR)) {
  fail(`Release directory not found: ${RELEASE_DIR}`);
}

const stamp = getTodayStamp();
const checklistPath = path.join(RELEASE_DIR, `release-checklist-${stamp}.md`);
if (!fs.existsSync(checklistPath)) {
  fail(`Checklist not found: ${path.relative(ROOT, checklistPath)} (run npm run release:checklist first)`);
}

const snapshot = readSnapshot();
const lines = fs.readFileSync(checklistPath, "utf8").split(/\r?\n/);

const envDevice = snapshot?.environment?.device || "PENDING";
const envBrowser = snapshot?.environment?.browser || "PENDING";
const envNetwork = snapshot?.environment?.network || "PENDING";
const envTool = snapshot?.environment?.tool || "PENDING";

setLine(lines, (l) => l.trimStart().startsWith("- Cihaz profili:"), `- Cihaz profili: ${envDevice}`);
setLine(lines, (l) => l.trimStart().startsWith("- Tarayici:"), `- Tarayici: ${envBrowser}`);
setLine(lines, (l) => l.trimStart().startsWith("- Ag profili:"), `- Ag profili: ${envNetwork}`);
setLine(lines, (l) => l.trimStart().startsWith("- Olcum araci:"), `- Olcum araci: ${envTool}`);

const targets = [
  { label: "/index.html", section: "user", key: "index" },
  { label: "/konular", section: "user", key: "konular" },
  { label: "/konu", section: "user", key: "konu" },
  { label: "/admin/index.html", section: "admin", key: "index" }
];

for (const target of targets) {
  const marker = lines.findIndex((line) => line.trim() === `- \`${target.label}\``);
  if (marker === -1) continue;
  const lcp = metricValue(snapshot, target.section, target.key, "lcp");
  const inp = metricValue(snapshot, target.section, target.key, "inp");
  const cls = metricValue(snapshot, target.section, target.key, "cls");

  for (let i = marker + 1; i < Math.min(lines.length, marker + 8); i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("- LCP:")) lines[i] = lines[i].replace(/- LCP:.*/, `- LCP: ${lcp}`);
    if (trimmed.startsWith("- INP:")) lines[i] = lines[i].replace(/- INP:.*/, `- INP: ${inp}`);
    if (trimmed.startsWith("- CLS:")) lines[i] = lines[i].replace(/- CLS:.*/, `- CLS: ${cls}`);
  }
}

fs.writeFileSync(checklistPath, lines.join("\n"), "utf8");
console.log(
  `[release-checklist-cwv] Updated: ${path.relative(ROOT, checklistPath)} (${snapshot ? "snapshot applied" : "PENDING values"})`
);
