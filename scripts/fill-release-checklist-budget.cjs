#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");

function fail(message) {
  console.error(`[release-checklist-budget] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function runBudgetCheck() {
  const result = spawnSync("npm run check:budgets", {
    cwd: ROOT,
    encoding: "utf8",
    shell: true
  });

  if (result.error) {
    fail(`Failed to run check:budgets: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    fail(`check:budgets failed (exit ${result.status}).`);
  }

  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function parseMetric(output, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escaped}:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*/\\s*([0-9]+(?:\\.[0-9]+)?)\\s*kB`);
  const match = output.match(pattern);
  if (!match) return null;
  return `${match[1]}/${match[2]} kB`;
}

function parseRiskTop3(output) {
  const lines = output.split(/\r?\n/);
  const start = lines.findIndex((line) => line.includes("Budget risk ranking (lowest headroom first):"));
  if (start === -1) return [];

  const risks = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) break;
    const m = line.match(/^\d+\.\s+(.+?)\s+->\s+([0-9.]+\s+kB)\s+headroom$/);
    if (!m) break;
    risks.push(`${m[1]} (${m[2]} headroom)`);
    if (risks.length === 3) break;
  }
  return risks;
}

function replaceLine(content, startsWith, nextValue) {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.trimStart().startsWith(startsWith));
  if (idx === -1) return content;
  lines[idx] = `${" ".repeat(lines[idx].match(/^\s*/)?.[0].length || 0)}${startsWith}${nextValue}`;
  return lines.join("\n");
}

if (!fs.existsSync(RELEASE_DIR)) {
  fail(`Release directory not found: ${RELEASE_DIR}`);
}

const stamp = getTodayStamp();
const checklistPath = path.join(RELEASE_DIR, `release-checklist-${stamp}.md`);
if (!fs.existsSync(checklistPath)) {
  fail(`Checklist not found: ${path.relative(ROOT, checklistPath)} (run npm run release:checklist first)`);
}

const output = runBudgetCheck();
const globalTotal = parseMetric(output, "totalGzipKb");
const globalJs = parseMetric(output, "jsGzipKb");
const globalCss = parseMetric(output, "cssGzipKb");
const globalHtml = parseMetric(output, "htmlGzipKb");
const topRisks = parseRiskTop3(output);

let content = fs.readFileSync(checklistPath, "utf8");
if (globalTotal) content = replaceLine(content, "- Global toplam gzip:", ` ${globalTotal}`);
if (globalJs) content = replaceLine(content, "- Global JS gzip:", ` ${globalJs}`);
if (globalCss) content = replaceLine(content, "- Global CSS gzip:", ` ${globalCss}`);
if (globalHtml) content = replaceLine(content, "- Global HTML gzip:", ` ${globalHtml}`);
if (topRisks[0]) content = replaceLine(content, "- 1.", ` ${topRisks[0]}`);
if (topRisks[1]) content = replaceLine(content, "- 2.", ` ${topRisks[1]}`);
if (topRisks[2]) content = replaceLine(content, "- 3.", ` ${topRisks[2]}`);

fs.writeFileSync(checklistPath, content, "utf8");
console.log(`[release-checklist-budget] Updated: ${path.relative(ROOT, checklistPath)}`);
