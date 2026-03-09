const { spawnSync } = require('child_process');

function getJavaMajorVersion() {
  const versionResult = spawnSync('java', ['-version'], { encoding: 'utf8' });
  const output = `${versionResult.stdout || ''}\n${versionResult.stderr || ''}`;
  const match = output.match(/version\s+"(\d+)(?:\.(\d+))?/i);
  if (!match) return null;
  const major = Number(match[1]);
  if (!Number.isFinite(major)) return null;
  return major === 1 ? Number(match[2] || 0) : major;
}

function run() {
  const javaMajor = getJavaMajorVersion();
  if (!javaMajor) {
    console.error('[rules-test] Java bulunamadı veya sürüm okunamadı. JDK 21+ gerekli.');
    process.exit(1);
  }

  if (javaMajor < 21) {
    console.error(`[rules-test] Java ${javaMajor} tespit edildi. Firestore Emulator için JDK 21+ gerekli.`);
    process.exit(1);
  }

  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['firebase', 'emulators:exec', '--only', 'firestore', 'node scripts/test-firestore-rules.cjs'],
    { stdio: 'inherit', shell: false }
  );

  if (result.error) {
    console.error('[rules-test] Emulator komutu çalıştırılamadı:', result.error.message);
    process.exit(1);
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    console.error(`[rules-test] Firestore rules testi basarisiz (exit code: ${result.status}).`);
    console.error('[rules-test] Yukaridaki ilk FAIL adimini kontrol edin; adimlar PASS/FAIL etiketlidir.');
  }

  if (result.signal) {
    console.error(`[rules-test] Test islemi sinyal ile sonlandi: ${result.signal}`);
  }

  process.exit(result.status || 0);
}

run();

