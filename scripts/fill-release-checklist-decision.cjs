#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");

function fail(message) {
  console.error(`[release-checklist-decision] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function collectStatuses(lines) {
  const statuses = [];
  for (const line of lines) {
    const m = line.match(/^\s*-\s+Sonuc:\s*`([^`]+)`/);
    if (m) statuses.push(m[1].trim().toUpperCase());
  }
  return statuses;
}

function replaceLine(lines, startsWith, value) {
  const idx = lines.findIndex((line) => line.trimStart().startsWith(startsWith));
  if (idx === -1) return lines;
  const indent = lines[idx].match(/^\s*/)?.[0] || "";
  lines[idx] = `${indent}${startsWith} ${value}`;
  return lines;
}

if (!fs.existsSync(RELEASE_DIR)) {
  fail(`Release directory not found: ${RELEASE_DIR}`);
}

const stamp = getTodayStamp();
const checklistPath = path.join(RELEASE_DIR, `release-checklist-${stamp}.md`);
if (!fs.existsSync(checklistPath)) {
  fail(`Checklist not found: ${path.relative(ROOT, checklistPath)} (run npm run release:checklist first)`);
}

const content = fs.readFileSync(checklistPath, "utf8");
const lines = content.split(/\r?\n/);
const statuses = collectStatuses(lines);

const hasFail = statuses.includes("FAIL");
const hasPending = statuses.includes("PASS/FAIL") || statuses.includes("PENDING");
const decision = hasFail || hasPending ? "NO-GO" : "GO";

replaceLine(lines, "- Karar:", `\`${decision}\``);
replaceLine(
  lines,
  "- Rollback notu:",
  hasFail
    ? "Guardrail fail nedeniyle mevcut surume geri don."
    : hasPending
      ? "Eksik/PENDING kapilar tamamlanmadan yayin acma."
      : "Yayin sonrasi izleme normal."
);

fs.writeFileSync(checklistPath, lines.join("\n"), "utf8");
console.log(`[release-checklist-decision] Updated: ${path.relative(ROOT, checklistPath)} (${decision})`);
