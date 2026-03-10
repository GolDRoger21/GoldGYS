#!/usr/bin/env node
const { spawnSync } = require("child_process");

function runStep(label, command, args) {
  console.log(`[auth-capture] ${label} başlatılıyor...`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    console.error(`[auth-capture] ${label} başarısız (exit=${result.status ?? 1}).`);
    process.exit(result.status || 1);
  }
  console.log(`[auth-capture] ${label} tamamlandı.`);
}

function main() {
  runStep("Kullanıcı storageState", "npm", ["run", "test:e2e:auth:capture:user"]);
  runStep("Yönetici storageState", "npm", ["run", "test:e2e:auth:capture:admin"]);
  runStep("Auth doğrulama", "npm", ["run", "test:e2e:auth:check:strict"]);
  console.log("[auth-capture] Tüm adımlar tamamlandı.");
}

main();
