#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");
const INCLUDE_E2E = process.argv.includes("--with-e2e");

function fail(message) {
  console.error(`[release-checklist-quality] ${message}`);
  process.exit(1);
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function runCommand(command) {
  const result = spawnSync(command, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true
  });
  if (result.error) return { status: "FAIL", note: result.error.message };
  if (result.status !== 0) return { status: "FAIL", note: `exit ${result.status}` };
  return { status: "PASS", note: "ok" };
}

function normalizeNote(note) {
  const text = String(note || "").trim();
  const match = text.match(/^auto-fill\s*\((.*)\)$/i);
  return match ? match[1].trim() : text;
}

function setCommandResult(content, cmd, status, note) {
  const lines = content.split(/\r?\n/);
  const targetLine = `- \`${cmd}\`:`;
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

function setSimpleStatus(content, startsWith, status, note) {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === startsWith);
  if (start === -1) return content;

  for (let i = start + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("- ") && !lines[i].startsWith("  -")) break;
    if (trimmed.startsWith("- Sonuc:")) {
      lines[i] = lines[i].replace(/- Sonuc:.*/, `- Sonuc: \`${status}\``);
    }
    if (trimmed.startsWith("- Not:") || trimmed.startsWith("- Kritik not:")) {
      const key = trimmed.startsWith("- Kritik not:") ? "- Kritik not:" : "- Not:";
      lines[i] = lines[i].replace(/- (Not|Kritik not):.*/, `${key} ${note}`);
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

const queryResult = runCommand("npm run audit:queries");
const modelResult = runCommand("npm run audit:content-model:strict");
const e2eResult = INCLUDE_E2E ? runCommand("npm run test:e2e:smoke:core") : { status: "SKIP", note: "use --with-e2e" };

let content = fs.readFileSync(checklistPath, "utf8");
content = setCommandResult(content, "npm run test:e2e:smoke:core", e2eResult.status, `auto-fill (${normalizeNote(e2eResult.note)})`);
content = setSimpleStatus(content, "- Query audit:", queryResult.status, `auto-fill (${normalizeNote(queryResult.note)})`);
content = setSimpleStatus(content, "- Content model drift audit:", modelResult.status, `auto-fill (${normalizeNote(modelResult.note)})`);

fs.writeFileSync(checklistPath, content, "utf8");
console.log(`[release-checklist-quality] Updated: ${path.relative(ROOT, checklistPath)}`);
