#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");
const INCLUDE_RULES = process.argv.includes("--with-rules");

function fail(message) {
  console.error(`[release-checklist-guardrails] ${message}`);
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
  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const firstOutputLine =
    output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith(">") && !line.startsWith("npm run")) || "";
  if (result.error) {
    return { status: "FAIL", note: result.error.message, output };
  }
  if (result.status !== 0) {
    const detail = firstOutputLine ? `, ${firstOutputLine.slice(0, 140)}` : "";
    return { status: "FAIL", note: `exit ${result.status}${detail}`, output };
  }
  return { status: "PASS", note: "ok", output };
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

if (!fs.existsSync(RELEASE_DIR)) {
  fail(`Release directory not found: ${RELEASE_DIR}`);
}

const stamp = getTodayStamp();
const checklistPath = path.join(RELEASE_DIR, `release-checklist-${stamp}.md`);
if (!fs.existsSync(checklistPath)) {
  fail(`Checklist not found: ${path.relative(ROOT, checklistPath)} (run npm run release:checklist first)`);
}

const commands = [
  "npm run ci:checks",
  "npm run audit:content-model:strict",
  "npm run test:content-model:contract"
];
if (INCLUDE_RULES) {
  commands.push("npm run test:rules");
}

let content = fs.readFileSync(checklistPath, "utf8");
for (const cmd of commands) {
  const result = runCommand(cmd);
  content = setCommandResult(content, cmd, result.status, `auto-fill (${result.note})`);
}

if (!INCLUDE_RULES) {
  content = setCommandResult(content, "npm run test:rules", "SKIP", "auto-fill (local run skipped, use --with-rules)");
}

fs.writeFileSync(checklistPath, content, "utf8");
console.log(`[release-checklist-guardrails] Updated: ${path.relative(ROOT, checklistPath)}`);
