#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");

function fail(message) {
  console.error(`[export-release-status] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function extractLineValue(content, regex, fallback = "UNKNOWN") {
  const m = content.match(regex);
  return m ? String(m[1]).trim() : fallback;
}

function extractCommandStatus(content, command) {
  const safe = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("- `" + safe + "`:[\\s\\S]*?- Sonuc: `([^`]+)`");
  return extractLineValue(content, re);
}

function extractGateStatus(content, gate) {
  return extractCommandStatus(content, gate);
}

function parseUsedLimit(text) {
  const m = String(text || "").match(/([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)\s*kB/i);
  if (!m) return null;
  const used = Number(m[1]);
  const limit = Number(m[2]);
  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    usedKb: round2(used),
    limitKb: round2(limit),
    headroomKb: round2(limit - used)
  };
}

function extractBudgetMetric(content, label) {
  const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = extractLineValue(content, new RegExp(`- ${safe}:\\s*([^\\n\\r]+)`), "");
  const parsed = parseUsedLimit(value);
  return parsed || { usedKb: null, limitKb: null, headroomKb: null };
}

function extractRiskLine(content, index) {
  return extractLineValue(content, new RegExp(`- ${index}\\.\\s*([^\\n\\r]+)`), "");
}

const stamp = getTodayStamp();
const checklistPath = path.join(RELEASE_DIR, `release-checklist-${stamp}.md`);
if (!fs.existsSync(checklistPath)) {
  fail(`Checklist not found: ${path.relative(ROOT, checklistPath)}`);
}

const content = fs.readFileSync(checklistPath, "utf8");
const outputPath = path.join(RELEASE_DIR, `release-status-${stamp}.json`);

const payload = {
  date: stamp,
  checklistPath: path.relative(ROOT, checklistPath).replace(/\\/g, "/"),
  commit: extractLineValue(content, /- Commit:\s*([^\n\r]+)/),
  version: extractLineValue(content, /- Surum etiketi:\s*([^\n\r]+)/),
  decision: extractLineValue(content, /- Karar:\s*`([^`]+)`/).toUpperCase(),
  guardrails: {
    ciChecks: extractCommandStatus(content, "npm run ci:checks"),
    modelStrict: extractCommandStatus(content, "npm run audit:content-model:strict"),
    modelContract: extractCommandStatus(content, "npm run test:content-model:contract"),
    rules: extractCommandStatus(content, "npm run test:rules"),
    e2eCore: extractCommandStatus(content, "npm run test:e2e:smoke:core")
  },
  phaseGates: {
    phase3to4: extractGateStatus(content, "Faz 3 -> Faz 4"),
    phase4to5: extractGateStatus(content, "Faz 4 -> Faz 5"),
    phase6to7: extractGateStatus(content, "Faz 6 -> Faz 7")
  },
  budget: {
    globalTotal: extractBudgetMetric(content, "Global toplam gzip"),
    globalJs: extractBudgetMetric(content, "Global JS gzip"),
    globalCss: extractBudgetMetric(content, "Global CSS gzip"),
    globalHtml: extractBudgetMetric(content, "Global HTML gzip"),
    riskTop3: [extractRiskLine(content, 1), extractRiskLine(content, 2), extractRiskLine(content, 3)].filter(Boolean)
  },
  cwv: {
    userIndexLcp: extractLineValue(content, /- `\/index\.html`[\s\S]*?- LCP:\s*([^\n\r]+)/),
    userKonularLcp: extractLineValue(content, /- `\/konular`[\s\S]*?- LCP:\s*([^\n\r]+)/),
    userKonuLcp: extractLineValue(content, /- `\/konu`[\s\S]*?- LCP:\s*([^\n\r]+)/),
    adminIndexLcp: extractLineValue(content, /- `\/admin\/index\.html`[\s\S]*?- LCP:\s*([^\n\r]+)/)
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`[export-release-status] Wrote: ${path.relative(ROOT, outputPath)}`);
