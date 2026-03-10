#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("@playwright/test");

const DEFAULTS = {
  role: "user",
  out: "tests/e2e/.auth/user.json",
  baseUrl: "http://localhost:5000",
  browserChannel: "chrome"
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
    if (key === "browser-channel") args.browserChannel = value;
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
  const loginUrl = new URL("/login.html", args.baseUrl).toString();
  const targetUrl = new URL(getTargetPath(role), args.baseUrl).toString();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  if (!process.stdin.isTTY) {
    console.error("[capture] Etkileşimli terminal bulunamadı. Bu komut manuel giriş gerektirir.");
    console.error("[capture] Yerel terminalde şu komutu çalıştırın:");
    console.error(`  node scripts/capture-e2e-storage-state.cjs --role=${role} --out=${args.out}`);
    process.exit(1);
  }

  console.log(`[capture] role=${role}`);
  console.log(`[capture] login=${loginUrl}`);
  console.log(`[capture] target=${targetUrl}`);
  console.log(`[capture] output=${outputPath}`);
  console.log("[capture] Tarayıcı açılıyor. Google ile giriş yapın ve hedef sayfaya ulaşın.");

  const browser = await chromium.launch({
    headless: false,
    channel: args.browserChannel || "chrome",
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"]
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

  console.log("[capture] Giriş tamamlandığında ve hedef sayfa açıldığında Enter'a basın.");
  await waitForEnter("> Enter");

  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  const finalUrl = page.url();
  if (/login(\.html)?/i.test(finalUrl)) {
    console.error(`[capture] Hata: Oturum doğrulanmadı, login sayfasına yönlendirildi: ${finalUrl}`);
    await context.close();
    await browser.close();
    process.exit(1);
  }

  await context.storageState({ path: outputPath, indexedDB: true });
  console.log("[capture] Başarılı. storageState kaydedildi.");
  await context.close();
  await browser.close();
}

run().catch((error) => {
  console.error("[capture] Beklenmeyen hata:", error);
  process.exit(1);
});
