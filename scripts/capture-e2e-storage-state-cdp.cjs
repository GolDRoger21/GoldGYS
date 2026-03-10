#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { chromium } = require("@playwright/test");

const DEFAULTS = {
  role: "user",
  out: "tests/e2e/.auth/user.json",
  baseUrl: "http://localhost:5000",
  cdpUrl: "http://127.0.0.1:9222"
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
    if (key === "cdp-url") args.cdpUrl = value;
  });
  return args;
}

function getTargetPath(role) {
  return role === "admin" ? "/admin" : "/dashboard";
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

function pickPage(context, baseUrl) {
  const pages = context.pages();
  const preferred = pages.find((p) => p.url().startsWith(baseUrl));
  return preferred || pages[0] || null;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const role = (args.role || "").toLowerCase();
  if (role !== "user" && role !== "admin") {
    console.error(`[capture-cdp] Geçersiz role: ${args.role}`);
    process.exit(1);
  }

  if (!process.stdin.isTTY) {
    console.error("[capture-cdp] Etkileşimli terminal bulunamadı.");
    process.exit(1);
  }

  const outputPath = path.resolve(process.cwd(), args.out);
  const loginUrl = new URL("/login", args.baseUrl).toString();
  const targetUrl = new URL(getTargetPath(role), args.baseUrl).toString();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  console.log(`[capture-cdp] role=${role}`);
  console.log(`[capture-cdp] cdp=${args.cdpUrl}`);
  console.log(`[capture-cdp] output=${outputPath}`);
  console.log("[capture-cdp] Önce Chrome'u remote debugging ile başlatın:");
  console.log("  chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\\goldgys-cdp http://localhost:5000/login");
  console.log("[capture-cdp] Giriş yaptıktan sonra Enter'a basın.");
  await waitForEnter("> Enter");

  const browser = await chromium.connectOverCDP(args.cdpUrl);
  try {
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error("CDP context bulunamadı. Chrome'u remote debugging ile başlatın.");
    }

    let page = pickPage(context, args.baseUrl);
    if (!page) {
      page = await context.newPage();
      await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    }

    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
    const finalUrl = page.url();
    if (/login(\.html)?/i.test(finalUrl)) {
      throw new Error(`Oturum doğrulanmadı, login sayfasına yönlendirildi: ${finalUrl}`);
    }

    await context.storageState({ path: outputPath, indexedDB: true });
    console.log("[capture-cdp] Başarılı. storageState kaydedildi.");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error("[capture-cdp] Hata:", error.message || error);
  process.exit(1);
});
