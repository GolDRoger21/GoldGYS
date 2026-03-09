#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "reports", "lighthouse");
const TMP_DIR = path.join(ROOT, ".tmp", "lighthouse");

function fail(message) {
  console.error(`[collect-cwv-lighthouse] ${message}`);
  process.exit(1);
}

function runCommand(command) {
  const result = spawnSync(command, {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    env: {
      ...process.env,
      TMP: TMP_DIR,
      TEMP: TMP_DIR
    }
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return result;
}

function resolveChromePath() {
  try {
    const result = spawnSync(
      process.execPath,
      ["-e", "const { chromium } = require('playwright'); console.log(chromium.executablePath());"],
      { cwd: ROOT, encoding: "utf8", shell: false }
    );
    const output = `${result.stdout || ""}`.trim();
    if (result.status === 0 && output) return output;
  } catch {}
  return "";
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

const chromePath = resolveChromePath();
if (!chromePath || !fs.existsSync(chromePath)) {
  fail("Playwright Chromium bulunamadi. Once `npx playwright install chromium` calistirin.");
}

ensureDir(OUT_DIR);
ensureDir(TMP_DIR);

const base = "http://127.0.0.1:5000";
const targets = [
  { url: `${base}/index.html`, out: path.join(OUT_DIR, "user-index.json") },
  { url: `${base}/konular`, out: path.join(OUT_DIR, "user-konular.json") },
  { url: `${base}/konu/ornek-konu`, out: path.join(OUT_DIR, "user-konu.json") },
  { url: `${base}/admin/index.html`, out: path.join(OUT_DIR, "admin-index.json") }
];

function q(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

for (const target of targets) {
  const userDataDir = path.join(TMP_DIR, target.out.includes("admin") ? "admin-profile" : "user-profile");
  const result = runCommand(
    [
      "npx lighthouse",
      q(target.url),
      "--quiet",
      "--chrome-path",
      q(chromePath),
      "--only-categories",
      "performance",
      "--output",
      "json",
      "--output-path",
      q(target.out),
      "--throttling-method",
      "simulate",
      "--preset",
      "desktop",
      "--chrome-flags",
      q(`--headless=new --no-sandbox --user-data-dir=${userDataDir}`)
    ].join(" ")
  );
  if (result.error) {
    fail(result.error.message);
  }
  if (result.status !== 0 && !fs.existsSync(target.out)) {
    fail(`Lighthouse failed and report missing: ${path.relative(ROOT, target.out)}`);
  }
  if (result.status !== 0 && fs.existsSync(target.out)) {
    console.warn(
      `[collect-cwv-lighthouse] Warning: Lighthouse exited with code ${result.status}, report exists: ${path.relative(ROOT, target.out)}`
    );
  }
}

const snapshotBuild = runCommand(
  [
    q(process.execPath),
    q(path.join("scripts", "build-cwv-snapshot.cjs")),
    q(`--user-index=${path.relative(ROOT, path.join(OUT_DIR, "user-index.json"))}`),
    q(`--user-konular=${path.relative(ROOT, path.join(OUT_DIR, "user-konular.json"))}`),
    q(`--user-konu=${path.relative(ROOT, path.join(OUT_DIR, "user-konu.json"))}`),
    q(`--admin-index=${path.relative(ROOT, path.join(OUT_DIR, "admin-index.json"))}`),
    q("--out=scripts/cwv-snapshot.json")
  ].join(" ")
);
if (snapshotBuild.error) {
  fail(snapshotBuild.error.message);
}
if (snapshotBuild.status !== 0) {
  fail(`Snapshot build failed with code ${snapshotBuild.status}`);
}

console.log("[collect-cwv-lighthouse] CWV snapshot generated from Lighthouse reports.");
