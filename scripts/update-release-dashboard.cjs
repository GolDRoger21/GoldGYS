#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");
const HISTORY_PATH = path.join(RELEASE_DIR, "release-history.json");
const SUGGESTION_PATH = path.join(RELEASE_DIR, "release-headroom-suggestion.json");
const DASHBOARD_PATH = path.join(RELEASE_DIR, "release-dashboard.md");
const PUBLIC_HEALTH_PATH = path.join(ROOT, "public", "data", "release-health.json");

function fail(message) {
  console.error(`[release-dashboard] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function fmtHeadroom(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} kB` : "unknown";
}

function normalizeDate(value) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function loadLatestStatus(lastDate) {
  if (!lastDate) return null;
  const statusPath = path.join(RELEASE_DIR, `release-status-${lastDate}.json`);
  return readJson(statusPath);
}

if (!fs.existsSync(RELEASE_DIR)) {
  fail(`Release directory not found: ${RELEASE_DIR}`);
}

const history = readJson(HISTORY_PATH);
if (!history) {
  fail(`History file not found or invalid: ${path.relative(ROOT, HISTORY_PATH)}`);
}

const totals = history?.summary?.totals || { total: 0, go: 0, noGo: 0 };
const last = history?.summary?.last || null;
const lastDate = normalizeDate(last?.date);
const status = loadLatestStatus(lastDate);
const suggestion = readJson(SUGGESTION_PATH);
const risks = Array.isArray(status?.budget?.riskTop3) ? status.budget.riskTop3 : [];

const lines = [
  "# Release Dashboard",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Summary",
  "",
  `- Total runs: ${totals.total || 0}`,
  `- GO: ${totals.go || 0}`,
  `- NO-GO: ${totals.noGo || 0}`,
  `- Last date: ${lastDate || "unknown"}`,
  `- Last decision: ${(last?.decision || "UNKNOWN").toUpperCase()}`,
  `- Last commit: ${last?.commit || "unknown"}`,
  `- Last version: ${last?.version || "unknown"}`,
  "",
  "## Budget Headroom (Last Run)",
  "",
  `- Total: ${fmtHeadroom(last?.budgetHeadroomKb?.total)}`,
  `- JS: ${fmtHeadroom(last?.budgetHeadroomKb?.js)}`,
  `- CSS: ${fmtHeadroom(last?.budgetHeadroomKb?.css)}`,
  `- HTML: ${fmtHeadroom(last?.budgetHeadroomKb?.html)}`,
  "",
  "## CWV LCP (Last Run)",
  "",
  `- User /index.html: ${status?.cwv?.userIndexLcp || "unknown"}`,
  `- User /konular: ${status?.cwv?.userKonularLcp || "unknown"}`,
  `- User /konu: ${status?.cwv?.userKonuLcp || "unknown"}`,
  `- Admin /admin/index.html: ${status?.cwv?.adminIndexLcp || "unknown"}`,
  "",
  "## Top Risks (Last Run)",
  "",
  `1. ${risks[0] || "unknown"}`,
  `2. ${risks[1] || "unknown"}`,
  `3. ${risks[2] || "unknown"}`,
  "",
  "## Suggested Gates",
  "",
  `- Suggested min_global_headroom_kb: ${Number.isFinite(Number(suggestion?.suggested?.minGlobalHeadroomKb)) ? Number(suggestion.suggested.minGlobalHeadroomKb).toFixed(2) : "unknown"}`,
  `- Suggested min_risk_headroom_kb: ${Number.isFinite(Number(suggestion?.suggested?.minRiskHeadroomKb)) ? Number(suggestion.suggested.minRiskHeadroomKb).toFixed(2) : "unknown"}`,
  `- Sample window: ${suggestion?.sampleWindow || 0}`,
  "",
  "## Gate Snapshot (Last Run)",
  "",
  `- ciChecks: ${status?.guardrails?.ciChecks || "unknown"}`,
  `- modelStrict: ${status?.guardrails?.modelStrict || "unknown"}`,
  `- modelContract: ${status?.guardrails?.modelContract || "unknown"}`,
  `- rules: ${status?.guardrails?.rules || "unknown"}`,
  `- e2eCore: ${status?.guardrails?.e2eCore || "unknown"}`,
  `- phase3to4: ${status?.phaseGates?.phase3to4 || "unknown"}`,
  `- phase4to5: ${status?.phaseGates?.phase4to5 || "unknown"}`,
  `- phase6to7: ${status?.phaseGates?.phase6to7 || "unknown"}`
];

fs.writeFileSync(DASHBOARD_PATH, `${lines.join("\n")}\n`, "utf8");
console.log(`[release-dashboard] Updated: ${path.relative(ROOT, DASHBOARD_PATH)}`);

const decision = String(last?.decision || "UNKNOWN").toUpperCase();
const gateStatuses = {
  ciChecks: status?.guardrails?.ciChecks || "unknown",
  modelStrict: status?.guardrails?.modelStrict || "unknown",
  modelContract: status?.guardrails?.modelContract || "unknown",
  rules: status?.guardrails?.rules || "unknown",
  e2eCore: status?.guardrails?.e2eCore || "unknown"
};
const failingGateCount = Object.values(gateStatuses).filter((value) => String(value).toUpperCase() !== "PASS").length;

let adminMessage = "Yayin oncesi kontrolleri tamamla.";
if (decision === "GO") {
  adminMessage = "Sistem yayin adayi icin hazir.";
} else if (decision === "NO-GO") {
  adminMessage = "NO-GO: Yayin yapmadan once failing gate'leri duzelt.";
}

const publicPayload = {
  generatedAt: new Date().toISOString(),
  lastDate: lastDate || "unknown",
  decision,
  commit: last?.commit || "unknown",
  version: last?.version || "unknown",
  budgetHeadroomKb: {
    total: Number.isFinite(last?.budgetHeadroomKb?.total) ? Number(last.budgetHeadroomKb.total) : null,
    js: Number.isFinite(last?.budgetHeadroomKb?.js) ? Number(last.budgetHeadroomKb.js) : null,
    css: Number.isFinite(last?.budgetHeadroomKb?.css) ? Number(last.budgetHeadroomKb.css) : null,
    html: Number.isFinite(last?.budgetHeadroomKb?.html) ? Number(last.budgetHeadroomKb.html) : null
  },
  failingGateCount,
  gateStatuses,
  phaseGates: {
    phase3to4: status?.phaseGates?.phase3to4 || "unknown",
    phase4to5: status?.phaseGates?.phase4to5 || "unknown",
    phase6to7: status?.phaseGates?.phase6to7 || "unknown"
  },
  risks,
  adminMessage
};

fs.mkdirSync(path.dirname(PUBLIC_HEALTH_PATH), { recursive: true });
fs.writeFileSync(PUBLIC_HEALTH_PATH, `${JSON.stringify(publicPayload, null, 2)}\n`, "utf8");
console.log(`[release-dashboard] Updated: ${path.relative(ROOT, PUBLIC_HEALTH_PATH)}`);
