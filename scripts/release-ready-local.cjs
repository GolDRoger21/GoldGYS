#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

function run(command) {
  const result = spawnSync(command, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command}`);
  }
}

function getTodayStamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readDecision() {
  const checklist = path.join(ROOT, "docs", "releases", `release-checklist-${getTodayStamp()}.md`);
  if (!fs.existsSync(checklist)) return { decision: "UNKNOWN", checklist };
  const text = fs.readFileSync(checklist, "utf8");
  const match = text.match(/- Karar:\s*`([^`]+)`/);
  const statusFile = path.join(ROOT, "docs", "releases", `release-status-${getTodayStamp()}.json`);
  return { decision: (match?.[1] || "UNKNOWN").trim().toUpperCase(), checklist, statusFile };
}

function main() {
  console.log("[release-ready-local] Step 1/5: ci:quick");
  run("npm run ci:quick");

  console.log("[release-ready-local] Step 2/5: test:rules");
  run("npm run test:rules");

  console.log("[release-ready-local] Step 3/5: measure:cwv");
  run("npm run measure:cwv");

  console.log("[release-ready-local] Step 4/5: release:checklist:refresh:full");
  run("npm run release:checklist:refresh:full");

  console.log("[release-ready-local] Step 5/5: release:headroom:check");
  run("npm run release:headroom:check:auto");

  const { decision, checklist, statusFile } = readDecision();
  console.log(`[release-ready-local] Decision: ${decision}`);
  console.log(`[release-ready-local] Checklist: ${path.relative(ROOT, checklist)}`);
  if (statusFile && fs.existsSync(statusFile)) {
    console.log(`[release-ready-local] Status JSON: ${path.relative(ROOT, statusFile)}`);
  }

  if (decision !== "GO") {
    process.exitCode = 1;
  }
}

main();
