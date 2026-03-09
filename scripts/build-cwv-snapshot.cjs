#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function fail(message) {
  console.error(`[build-cwv-snapshot] ${message}`);
  process.exit(1);
}

function resolveArg(prefix, fallback = "") {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  if (!arg) return fallback;
  const value = arg.slice(prefix.length).trim();
  return value || fallback;
}

function resolvePath(value) {
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(ROOT, value);
}

function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    fail(`Report not found: ${path.relative(ROOT, filePath || "")}`);
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (error) {
    fail(`Invalid JSON (${path.relative(ROOT, filePath)}): ${error.message}`);
  }
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) return "PENDING";
  return `${value.toFixed(2)}s`;
}

function formatMs(value) {
  if (!Number.isFinite(value)) return "N/A (lab interaction yok)";
  return `${Math.round(value)}ms`;
}

function formatCls(value) {
  if (!Number.isFinite(value)) return "PENDING";
  return value.toFixed(3);
}

function metricOf(report, key) {
  return report?.audits?.[key]?.numericValue;
}

function pickEnv(...reports) {
  const first = reports.find(Boolean) || {};
  const formFactor = first?.configSettings?.formFactor || "unknown";
  const ua = first?.userAgent || "unknown";
  const throttle = first?.configSettings?.throttlingMethod || "unknown";
  return {
    device: formFactor,
    browser: ua,
    network: throttle,
    tool: "Lighthouse JSON"
  };
}

function mapReport(report) {
  const lcpMs = metricOf(report, "largest-contentful-paint");
  const inpMs = metricOf(report, "interaction-to-next-paint");
  const cls = metricOf(report, "cumulative-layout-shift");
  return {
    lcp: formatSeconds(Number(lcpMs) / 1000),
    inp: formatMs(Number(inpMs)),
    cls: formatCls(Number(cls))
  };
}

const userIndexPath = resolvePath(resolveArg("--user-index="));
const userKonularPath = resolvePath(resolveArg("--user-konular="));
const userKonuPath = resolvePath(resolveArg("--user-konu="));
const adminIndexPath = resolvePath(resolveArg("--admin-index="));
const outputPath = resolvePath(resolveArg("--out=", "scripts/cwv-snapshot.json"));

if (!userIndexPath || !userKonularPath || !userKonuPath || !adminIndexPath) {
  fail("Missing required args: --user-index --user-konular --user-konu --admin-index");
}

const userIndex = readJson(userIndexPath);
const userKonular = readJson(userKonularPath);
const userKonu = readJson(userKonuPath);
const adminIndex = readJson(adminIndexPath);

const snapshot = {
  environment: pickEnv(userIndex, userKonular, userKonu, adminIndex),
  user: {
    index: mapReport(userIndex),
    konular: mapReport(userKonular),
    konu: mapReport(userKonu)
  },
  admin: {
    index: mapReport(adminIndex)
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`[build-cwv-snapshot] Wrote: ${path.relative(ROOT, outputPath)}`);
