#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");

function fail(message) {
  console.error(`[release-checklist-meta] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function run(command) {
  const result = spawnSync(command, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true
  });
  if (result.error || result.status !== 0) return "";
  return `${result.stdout || ""}`.trim();
}

function replaceLine(content, startsWith, value) {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.trimStart().startsWith(startsWith));
  if (idx === -1) return content;
  const indent = lines[idx].match(/^\s*/)?.[0] || "";
  lines[idx] = `${indent}${startsWith} ${value}`;
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

const commitShort = run("git rev-parse --short HEAD") || "(unknown)";
let version = "";
try {
  const rawPkg = fs.readFileSync(path.join(ROOT, "package.json"), "utf8").replace(/^\uFEFF/, "");
  const pkg = JSON.parse(rawPkg);
  version = String(pkg.version || "").trim();
} catch {
  version = "";
}

let content = fs.readFileSync(checklistPath, "utf8");
content = replaceLine(content, "- Tarih:", stamp);
content = replaceLine(content, "- Commit:", commitShort);
if (version) {
  content = replaceLine(content, "- Surum etiketi:", `v${version}`);
}

fs.writeFileSync(checklistPath, content, "utf8");
console.log(`[release-checklist-meta] Updated: ${path.relative(ROOT, checklistPath)}`);
