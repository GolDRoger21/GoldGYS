#!/usr/bin/env node
const { spawnSync } = require("child_process");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  return result.status === 0;
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32"
  });
  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  return {
    ok: result.status === 0,
    output: `${stdout}\n${stderr}`
  };
}

function main() {
  console.log("[smoke:optional-auth] Core smoke başlatılıyor...");
  const coreOk = run("npm", ["run", "test:e2e:smoke:core"]);
  if (!coreOk) {
    console.error("[smoke:optional-auth] Core smoke başarısız.");
    process.exit(1);
  }

  console.log("[smoke:optional-auth] Auth state kontrol ediliyor...");
  const check = runCapture("npm", ["run", "test:e2e:auth:check"]);
  if (!check.ok) {
    console.error("[smoke:optional-auth] Auth state kontrol komutu başarısız.");
    process.exit(1);
  }

  const hasAuthIssues = /\[user\]\s+FAIL|\[admin\]\s+FAIL/i.test(check.output);
  if (hasAuthIssues) {
    console.log("[smoke:optional-auth] Geçerli auth state bulunamadı, auth smoke atlandı.");
    console.log("[smoke:optional-auth] Gerektiğinde çalıştırın:");
    console.log("  npm run test:e2e:auth:capture:user");
    console.log("  npm run test:e2e:auth:capture:admin");
    console.log("  npm run test:e2e:smoke:auth:strict");
    process.exit(0);
  }

  console.log("[smoke:optional-auth] Auth state hazır, auth smoke başlatılıyor...");
  const authOk = run("npm", ["run", "test:e2e:smoke:auth:strict"]);
  if (!authOk) {
    console.error("[smoke:optional-auth] Auth smoke başarısız.");
    process.exit(1);
  }

  console.log("[smoke:optional-auth] Tüm smoke adımları başarılı.");
}

main();
