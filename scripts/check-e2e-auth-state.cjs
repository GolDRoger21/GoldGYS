#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    strict: false,
    userPath: "tests/e2e/.auth/user.json",
    adminPath: "tests/e2e/.auth/admin.json"
  };

  argv.forEach((entry) => {
    if (!entry.startsWith("--")) return;
    const [rawKey, rawValue] = entry.slice(2).split("=");
    const key = rawKey.trim();
    const value = (rawValue || "").trim();
    if (key === "strict") args.strict = true;
    if (key === "user" && value) args.userPath = value;
    if (key === "admin" && value) args.adminPath = value;
  });

  return args;
}

function validateStateFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    return { ok: false, file: abs, reason: "dosya bulunamadı" };
  }

  let parsed;
  try {
    const raw = fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, file: abs, reason: `geçersiz JSON (${error.message})` };
  }

  const hasCookies = Array.isArray(parsed?.cookies);
  const hasOrigins = Array.isArray(parsed?.origins);
  if (!hasCookies || !hasOrigins) {
    return {
      ok: false,
      file: abs,
      reason: "storageState formatı geçersiz (cookies/origins dizileri yok)"
    };
  }

  return {
    ok: true,
    file: abs,
    cookies: parsed.cookies.length,
    origins: parsed.origins.length
  };
}

function printResult(label, result) {
  if (result.ok) {
    console.log(`[${label}] OK -> ${result.file} (cookies=${result.cookies}, origins=${result.origins})`);
    return;
  }
  console.log(`[${label}] FAIL -> ${result.file} (${result.reason})`);
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  const user = validateStateFile(args.userPath);
  const admin = validateStateFile(args.adminPath);

  printResult("user", user);
  printResult("admin", admin);

  const allOk = user.ok && admin.ok;
  if (!allOk) {
    console.log("");
    console.log("Çözüm:");
    console.log("1) npm run test:e2e:auth:capture:user");
    console.log("2) npm run test:e2e:auth:capture:admin");
    console.log("3) npm run test:e2e:smoke:auth");
  }

  if (args.strict && !allOk) {
    process.exit(1);
  }
}

run();
