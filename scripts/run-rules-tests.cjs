const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function normalizeMajor(match) {
  const major = Number(match[1]);
  if (!Number.isFinite(major)) return null;
  if (major === 1) {
    const legacyMajor = Number(match[2] || 0);
    return Number.isFinite(legacyMajor) ? legacyMajor : null;
  }
  return major;
}

function parseJavaMajor(output) {
  const match = String(output || "").match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (!match) return null;
  return normalizeMajor(match);
}

function javaVersionFrom(command, args = ["-version"], env = process.env) {
  const result = spawnSync(command, args, { encoding: "utf8", env, shell: false });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return { major: parseJavaMajor(output), output, error: result.error || null };
}

function findTemurinJava21() {
  if (process.platform !== "win32") return null;
  const baseDir = "C:\\Program Files\\Eclipse Adoptium";
  if (!fs.existsSync(baseDir)) return null;

  let entries = [];
  try {
    entries = fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^jdk-21/i.test(entry.name))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return null;
  }

  for (const name of entries) {
    const javaPath = path.join(baseDir, name, "bin", "java.exe");
    if (fs.existsSync(javaPath)) return javaPath;
  }
  return null;
}

function resolveJavaRuntime() {
  const current = javaVersionFrom("java");
  if (current.major && current.major >= 21) {
    return { command: "java", major: current.major, env: process.env };
  }

  const temurinJava = findTemurinJava21();
  if (temurinJava) {
    const temurin = javaVersionFrom(temurinJava);
    if (temurin.major && temurin.major >= 21) {
      const binDir = path.dirname(temurinJava);
      return {
        command: temurinJava,
        major: temurin.major,
        env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}` }
      };
    }
  }

  return { command: "java", major: current.major, env: process.env, output: current.output };
}

function run() {
  const javaRuntime = resolveJavaRuntime();
  if (!javaRuntime.major) {
    console.error("[rules-test] Java bulunamadi veya surum okunamadi. JDK 21+ gerekli.");
    process.exit(1);
  }

  if (javaRuntime.major < 21) {
    console.error(`[rules-test] Java ${javaRuntime.major} tespit edildi. Firestore Emulator icin JDK 21+ gerekli.`);
    process.exit(1);
  }

  const command = "npx firebase emulators:exec --only firestore \"node scripts/test-firestore-rules.cjs\"";
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env: javaRuntime.env
  });

  if (result.error) {
    console.error("[rules-test] Emulator komutu calistirilamadi:", result.error.message);
    process.exit(1);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    console.error(`[rules-test] Firestore rules testi basarisiz (exit code: ${result.status}).`);
    console.error("[rules-test] Yukaridaki ilk FAIL adimini kontrol edin; adimlar PASS/FAIL etiketlidir.");
  }
  if (result.signal) {
    console.error(`[rules-test] Test islemi sinyal ile sonlandi: ${result.signal}`);
  }

  process.exit(result.status || 0);
}

run();
