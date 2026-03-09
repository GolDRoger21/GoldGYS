#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");

function fail(message) {
  console.error(`[release-checklist-phase-gates] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensurePhaseSection(content) {
  if (content.includes("## 7) Faz Gecis Durumu")) return content;
  return `${content.trimEnd()}\n\n## 7) Faz Gecis Durumu\n\n- \`Faz 3 -> Faz 4\`:\n  - Sonuc: \`PASS/FAIL/PENDING\`\n  - Not:\n- \`Faz 4 -> Faz 5\`:\n  - Sonuc: \`PASS/FAIL/PENDING\`\n  - Not:\n- \`Faz 6 -> Faz 7\`:\n  - Sonuc: \`PASS/FAIL/PENDING\`\n  - Not:\n`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getStatus(content, commandName) {
  const re = new RegExp("- `" + escapeRegExp(commandName) + "`:[\\s\\S]*?- Sonuc: `([^`]+)`");
  const m = content.match(re);
  if (!m) return "UNKNOWN";
  return m[1].trim().toUpperCase();
}

function getSimpleStatus(content, label) {
  const re = new RegExp("- " + escapeRegExp(label) + ":\\s*[\\s\\S]*?- Sonuc: `([^`]+)`");
  const m = content.match(re);
  if (!m) return "UNKNOWN";
  return m[1].trim().toUpperCase();
}

function hasPendingCwv(content) {
  const cwvMatch = content.match(/## 3\) Core Web Vitals[\s\S]*?(## 4\)|$)/);
  if (!cwvMatch) return true;
  const lines = cwvMatch[0].split(/\r?\n/).map((line) => line.trim());
  const criticalPrefixes = [
    "- Cihaz profili:",
    "- Tarayici:",
    "- Ag profili:",
    "- Olcum araci:",
    "- LCP:",
    "- CLS:"
  ];
  return lines.some((line) => criticalPrefixes.some((prefix) => line.startsWith(prefix) && /\bPENDING\b/i.test(line)));
}

function parseBudgetLine(content, startsWith) {
  const line = content
    .split(/\r?\n/)
    .find((row) => row.trim().startsWith(startsWith));
  if (!line) return null;
  const m = line.match(/:\s*([0-9.]+)\s*\/\s*([0-9.]+)\s*kB/i);
  if (!m) return null;
  return { used: Number(m[1]), limit: Number(m[2]) };
}

function isBudgetPass(content) {
  const checks = [
    "- Global toplam gzip:",
    "- Global JS gzip:",
    "- Global CSS gzip:",
    "- Global HTML gzip:"
  ];
  for (const key of checks) {
    const v = parseBudgetLine(content, key);
    if (!v) return false;
    if (!Number.isFinite(v.used) || !Number.isFinite(v.limit) || v.used > v.limit) return false;
  }
  return true;
}

function setGateResult(content, gateTitle, status, note) {
  const lines = content.split(/\r?\n/);
  const targetLine = `- \`${gateTitle}\`:`;
  const start = lines.findIndex((line) => line.trim() === targetLine);
  if (start === -1) return content;

  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("- `") && !lines[i].startsWith("  -")) break;
    if (trimmed.startsWith("- Sonuc:")) {
      lines[i] = lines[i].replace(/- Sonuc:.*/, `- Sonuc: \`${status}\``);
    }
    if (trimmed.startsWith("- Not:")) {
      lines[i] = lines[i].replace(/- Not:.*/, `- Not: ${note}`);
      break;
    }
  }
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

let content = fs.readFileSync(checklistPath, "utf8");
content = ensurePhaseSection(content);

const ciChecks = getStatus(content, "npm run ci:checks");
const strictModel = getStatus(content, "npm run audit:content-model:strict");
const contract = getStatus(content, "npm run test:content-model:contract");
const rules = getStatus(content, "npm run test:rules");
const queryAudit = getSimpleStatus(content, "Query audit");
const modelDrift = getSimpleStatus(content, "Content model drift audit");

const gate34Pass = ciChecks === "PASS" && strictModel === "PASS";
const gate34 = gate34Pass ? { status: "PASS", note: "auto-fill (ci + strict model pass)" } : { status: "PENDING", note: "auto-fill (ci/strict model tamamlanmadi)" };

const budgetPass = isBudgetPass(content);
const cwvReady = !hasPendingCwv(content);
let gate45;
if (budgetPass && cwvReady) {
  gate45 = { status: "PASS", note: "auto-fill (budget pass + cwv mevcut)" };
} else if (budgetPass && !cwvReady) {
  gate45 = { status: "PENDING", note: "auto-fill (budget pass, cwv pending)" };
} else {
  gate45 = { status: "FAIL", note: "auto-fill (budget fail veya eksik)" };
}

const gate67Pass =
  ciChecks === "PASS" &&
  strictModel === "PASS" &&
  contract === "PASS" &&
  queryAudit === "PASS" &&
  modelDrift === "PASS" &&
  rules !== "FAIL";
let gate67;
if (gate67Pass && rules === "PASS") {
  gate67 = { status: "PASS", note: "auto-fill (ci + model + rules + quality pass)" };
} else if (gate67Pass && rules === "SKIP") {
  gate67 = { status: "PENDING", note: "auto-fill (rules local skip, full check onerilir)" };
} else {
  gate67 = { status: "FAIL", note: "auto-fill (ci/model/quality gate fail)" };
}

content = setGateResult(content, "Faz 3 -> Faz 4", gate34.status, gate34.note);
content = setGateResult(content, "Faz 4 -> Faz 5", gate45.status, gate45.note);
content = setGateResult(content, "Faz 6 -> Faz 7", gate67.status, gate67.note);

fs.writeFileSync(checklistPath, content, "utf8");
console.log(`[release-checklist-phase-gates] Updated: ${path.relative(ROOT, checklistPath)}`);
