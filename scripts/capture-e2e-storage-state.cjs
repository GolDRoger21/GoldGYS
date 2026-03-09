#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("@playwright/test");

const DEFAULTS = {
  role: "user",
  out: "tests/e2e/.auth/user.json",
  baseUrl: "http://127.0.0.1:5000"
};

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  argv.forEach((entry) => {
    if (!entry.startsWith("--")) return;
    const [rawKey, rawValue] = entry.slice(2).split("=");
    const key = rawKey.trim();
    const value = (rawValue || "").trim();
    if (!value) return;
    if (key === "role") args.role = value;
    if (key === "out") args.out = value;
    if (key === "base-url") args.baseUrl = value;
  });
  return args;
}

function getTargetPath(role) {
  return role === "admin" ? "/admin" : "/dashboard";
}

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/capture-e2e-storage-state.cjs --role=user --out=tests/e2e/.auth/user.json");
  console.log("  node scripts/capture-e2e-storage-state.cjs --role=admin --out=tests/e2e/.auth/admin.json");
}

function waitForEnter(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const role = (args.role || "").toLowerCase();
  if (role !== "user" && role !== "admin") {
    console.error(`Invalid role: ${args.role}`);
    printUsage();
    process.exit(1);
  }

  const outputPath = path.resolve(process.cwd(), args.out);
  const targetUrl = new URL(getTargetPath(role), args.baseUrl).toString();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(`[capture] role=${role}`);
  console.log(`[capture] target=${targetUrl}`);
  console.log(`[capture] output=${outputPath}`);
  console.log("[capture] Browser aciliyor. Google ile giris yapin ve hedef sayfaya ulasin.");

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login.html", { waitUntil: "domcontentloaded" });

  console.log("[capture] Login tamamlandiginda ve hedef sayfa acildiginda Enter'a basin.");
  await waitForEnter("> Enter");

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  const finalUrl = page.url();
  if (/login(\.html)?/i.test(finalUrl)) {
    console.error(`[capture] Hata: Oturum dogrulanmadi, login sayfasina yonlendirildi: ${finalUrl}`);
    await context.close();
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: outputPath });
  console.log("[capture] Basarili. storageState kaydedildi.");
  await context.close();
  await browser.close();
}

run().catch((error) => {
  console.error("[capture] Beklenmeyen hata:", error);
  process.exit(1);
});
