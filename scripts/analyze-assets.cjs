#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const BUDGETS_FILE = path.join(__dirname, "asset-budgets.json");
const INCLUDE_EXT = new Set([".js", ".css", ".html", ".svg"]);
const BUDGET_WARN_RATIO = 0.9;

const DEFAULT_BUDGETS = Object.freeze({
  totalGzipKb: 450,
  jsGzipKb: 220,
  cssGzipKb: 60,
  htmlGzipKb: 170,
  maxSingleJsGzipKb: 90
});
const DEFAULT_ROUTE_BUDGETS = Object.freeze({
  userHome: {
    entryHtml: "/index.html",
    totalGzipKb: 220,
    jsGzipKb: 130,
    cssGzipKb: 35,
    maxSingleAssetGzipKb: 90
  },
  adminDashboard: {
    entryHtml: "/admin/index.html",
    totalGzipKb: 260,
    jsGzipKb: 170,
    cssGzipKb: 45,
    maxSingleAssetGzipKb: 100
  }
});

function loadBudgetConfig() {
  if (!fs.existsSync(BUDGETS_FILE)) {
    return { global: DEFAULT_BUDGETS, routes: DEFAULT_ROUTE_BUDGETS, source: "default" };
  }

  try {
    const raw = fs.readFileSync(BUDGETS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const global = parsed?.global && typeof parsed.global === "object"
      ? { ...DEFAULT_BUDGETS, ...parsed.global }
      : DEFAULT_BUDGETS;
    const routes = parsed?.routes && typeof parsed.routes === "object"
      ? { ...DEFAULT_ROUTE_BUDGETS, ...parsed.routes }
      : DEFAULT_ROUTE_BUDGETS;

    return { global, routes, source: path.relative(process.cwd(), BUDGETS_FILE) };
  } catch (error) {
    console.warn(`[WARN] Budget config parse failed (${BUDGETS_FILE}): ${error.message}`);
    return { global: DEFAULT_BUDGETS, routes: DEFAULT_ROUTE_BUDGETS, source: "default" };
  }
}

function readFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      files = files.concat(readFiles(fullPath));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!entry.isFile() || !INCLUDE_EXT.has(ext)) continue;

    const content = fs.readFileSync(fullPath);
    files.push({
      path: fullPath,
      ext,
      size: content.length,
      gzip: zlib.gzipSync(content).length
    });
  }

  return files;
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

function getSummary(files) {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const totalGzip = files.reduce((sum, file) => sum + file.gzip, 0);
  const byType = files.reduce((acc, file) => {
    acc[file.ext] = acc[file.ext] || { size: 0, gzip: 0, count: 0 };
    acc[file.ext].size += file.size;
    acc[file.ext].gzip += file.gzip;
    acc[file.ext].count += 1;
    return acc;
  }, {});

  const jsFiles = files.filter((f) => f.ext === ".js");
  const largestJs = jsFiles.reduce((max, file) => (file.gzip > max.gzip ? file : max), {
    path: "",
    gzip: 0,
    size: 0,
    ext: ".js"
  });

  return { totalSize, totalGzip, byType, largestJs };
}

function printSummary(summary) {
  console.log("Static asset boyutu (public/):");
  console.log(`  Toplam: ${formatKb(summary.totalSize)} | gzip: ${formatKb(summary.totalGzip)}`);
  Object.entries(summary.byType).forEach(([ext, data]) => {
    console.log(`  ${ext} -> ${data.count} dosya | ${formatKb(data.size)} (gzip: ${formatKb(data.gzip)})`);
  });
}

function printTopTable(files) {
  const sorted = [...files].sort((a, b) => b.gzip - a.gzip).slice(0, 15);
  console.log("\nEn buyuk 15 dosya (gzip):");
  sorted.forEach((file) => {
    const relative = path.relative(process.cwd(), file.path);
    console.log(`  ${formatKb(file.gzip)} gzip | ${formatKb(file.size)} raw | ${relative}`);
  });
}

function stripQueryAndHash(value) {
  return value.split("#")[0].split("?")[0];
}

function parseHtmlAssets(htmlContent) {
  const assets = new Set();
  const scriptRegex = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
  const cssRegex = /<link[^>]*\srel=["']stylesheet["'][^>]*\shref=["']([^"']+)["'][^>]*>/gi;
  let match = null;

  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    assets.add(match[1]);
  }
  while ((match = cssRegex.exec(htmlContent)) !== null) {
    assets.add(match[1]);
  }

  return [...assets];
}

function resolveAssetPath(entryHtmlPath, assetRef) {
  const cleanRef = stripQueryAndHash(assetRef || "").trim();
  if (!cleanRef || cleanRef.startsWith("http://") || cleanRef.startsWith("https://") || cleanRef.startsWith("//")) {
    return null;
  }
  if (cleanRef.startsWith("data:") || cleanRef.startsWith("javascript:") || cleanRef.startsWith("#")) {
    return null;
  }

  const withoutLeadingSlash = cleanRef.startsWith("/") ? cleanRef.slice(1) : cleanRef;
  const candidate = cleanRef.startsWith("/")
    ? path.join(PUBLIC_DIR, withoutLeadingSlash)
    : path.resolve(path.dirname(entryHtmlPath), cleanRef);

  if (!candidate.startsWith(PUBLIC_DIR)) {
    return null;
  }
  return path.normalize(candidate);
}

function buildFileMap(files) {
  const map = new Map();
  files.forEach((file) => {
    map.set(path.normalize(file.path), file);
  });
  return map;
}

function getRouteEntrySummary(files, routeBudget) {
  const entryAbsPath = path.normalize(path.join(PUBLIC_DIR, routeBudget.entryHtml.replace(/^\//, "")));
  if (!fs.existsSync(entryAbsPath)) {
    return { missingEntry: true, entryAbsPath, assets: [], totalGzip: 0, byExt: {}, largestAsset: null };
  }

  const fileMap = buildFileMap(files);
  const htmlContent = fs.readFileSync(entryAbsPath, "utf8");
  const assetRefs = parseHtmlAssets(htmlContent);
  const seen = new Set();
  const assets = [];

  for (const assetRef of assetRefs) {
    const assetPath = resolveAssetPath(entryAbsPath, assetRef);
    if (!assetPath || seen.has(assetPath)) continue;
    seen.add(assetPath);
    const file = fileMap.get(assetPath);
    if (!file) continue;
    assets.push(file);
  }

  const byExt = assets.reduce((acc, file) => {
    acc[file.ext] = acc[file.ext] || { gzip: 0, count: 0 };
    acc[file.ext].gzip += file.gzip;
    acc[file.ext].count += 1;
    return acc;
  }, {});
  const totalGzip = assets.reduce((sum, file) => sum + file.gzip, 0);
  const largestAsset = assets.reduce((max, file) => (file.gzip > max.gzip ? file : max), {
    path: "",
    gzip: 0,
    size: 0
  });

  return { missingEntry: false, entryAbsPath, assets, totalGzip, byExt, largestAsset };
}

function validateRouteBudgets(files, routeBudgets) {
  console.log("\nRoute budget check:");
  const failures = [];
  const warnings = [];
  const metrics = [];

  Object.entries(routeBudgets).forEach(([routeKey, config]) => {
    const summary = getRouteEntrySummary(files, config);
    if (summary.missingEntry) {
      console.log(`  [WARN] ${routeKey}: entry not found (${path.relative(process.cwd(), summary.entryAbsPath)})`);
      return;
    }

    const jsGzipKb = (summary.byExt[".js"]?.gzip || 0) / 1024;
    const cssGzipKb = (summary.byExt[".css"]?.gzip || 0) / 1024;
    const totalGzipKb = summary.totalGzip / 1024;
    const maxSingleAssetGzipKb = (summary.largestAsset?.gzip || 0) / 1024;
    const checks = [
      { label: "totalGzipKb", actual: totalGzipKb, limit: config.totalGzipKb },
      { label: "jsGzipKb", actual: jsGzipKb, limit: config.jsGzipKb },
      { label: "cssGzipKb", actual: cssGzipKb, limit: config.cssGzipKb },
      { label: "maxSingleAssetGzipKb", actual: maxSingleAssetGzipKb, limit: config.maxSingleAssetGzipKb }
    ];
    console.log(`  ${routeKey} (${config.entryHtml})`);
    checks.forEach((item) => {
      const isOk = item.actual <= item.limit;
      const status = isOk ? "OK" : "FAIL";
      const headroom = item.limit - item.actual;
      console.log(`    [${status}] ${item.label}: ${item.actual.toFixed(2)} / ${item.limit.toFixed(2)} kB | headroom: ${headroom.toFixed(2)} kB`);
      if (!isOk) failures.push(`${routeKey}:${item.label}`);
      if (isOk && item.actual >= item.limit * BUDGET_WARN_RATIO) {
        warnings.push(`${routeKey}:${item.label} (${item.actual.toFixed(2)}/${item.limit.toFixed(2)} kB)`);
      }
      metrics.push({
        scope: routeKey,
        label: item.label,
        actual: item.actual,
        limit: item.limit,
        headroom
      });
    });
  });

  return { failures, warnings, metrics };
}

function validateBudgets(summary, budgets) {
  const getTypeGzip = (ext) => (summary.byType[ext]?.gzip || 0) / 1024;
  const totalGzipKb = summary.totalGzip / 1024;
  const largestJsGzipKb = (summary.largestJs?.gzip || 0) / 1024;
  const checks = [
    { label: "totalGzipKb", actual: totalGzipKb, limit: budgets.totalGzipKb },
    { label: "jsGzipKb", actual: getTypeGzip(".js"), limit: budgets.jsGzipKb },
    { label: "cssGzipKb", actual: getTypeGzip(".css"), limit: budgets.cssGzipKb },
    { label: "htmlGzipKb", actual: getTypeGzip(".html"), limit: budgets.htmlGzipKb },
    { label: "maxSingleJsGzipKb", actual: largestJsGzipKb, limit: budgets.maxSingleJsGzipKb }
  ];

  const failures = checks.filter((item) => item.actual > item.limit);
  const warnings = checks.filter(
    (item) => item.actual <= item.limit && item.actual >= item.limit * BUDGET_WARN_RATIO
  );
  const metrics = checks.map((item) => ({
    scope: "global",
    label: item.label,
    actual: item.actual,
    limit: item.limit,
    headroom: item.limit - item.actual
  }));
  console.log("\nAsset budget check:");
  checks.forEach((item) => {
    const status = item.actual <= item.limit ? "OK" : "FAIL";
    const headroom = item.limit - item.actual;
    console.log(`  [${status}] ${item.label}: ${item.actual.toFixed(2)} / ${item.limit.toFixed(2)} kB | headroom: ${headroom.toFixed(2)} kB`);
  });

  if (failures.length > 0 && summary.largestJs?.path) {
    const relative = path.relative(process.cwd(), summary.largestJs.path);
    console.log(`  Largest JS file: ${relative} (${formatKb(summary.largestJs.gzip)} gzip)`);
  }

  return {
    failures,
    warnings: warnings.map((item) => `${item.label} (${item.actual.toFixed(2)}/${item.limit.toFixed(2)} kB)`),
    metrics
  };
}

if (!fs.existsSync(PUBLIC_DIR)) {
  console.error(`Public directory not found: ${PUBLIC_DIR}`);
  process.exit(1);
}

const files = readFiles(PUBLIC_DIR);
const summary = getSummary(files);
const shouldAnalyze = process.argv.includes("--analyze");
const shouldCheckBudgets = process.argv.includes("--check-budgets");
const budgetConfig = loadBudgetConfig();

printSummary(summary);

if (shouldAnalyze) {
  printTopTable(files);
}

if (shouldCheckBudgets) {
  console.log(`\nBudget source: ${budgetConfig.source}`);
  const globalResult = validateBudgets(summary, budgetConfig.global);
  const routeResult = validateRouteBudgets(files, budgetConfig.routes);
  const riskRanking = [...globalResult.metrics, ...routeResult.metrics]
    .sort((a, b) => a.headroom - b.headroom)
    .slice(0, 8);
  if (riskRanking.length > 0) {
    console.log("\nBudget risk ranking (lowest headroom first):");
    riskRanking.forEach((item, index) => {
      console.log(
        `  ${index + 1}. ${item.scope}:${item.label} -> ${item.headroom.toFixed(2)} kB headroom`
      );
    });
  }
  if (globalResult.warnings.length > 0 || routeResult.warnings.length > 0) {
    console.log("\nBudget near-limit warnings:");
    globalResult.warnings.forEach((warning) => console.log(`  [WARN] global:${warning}`));
    routeResult.warnings.forEach((warning) => console.log(`  [WARN] ${warning}`));
  }
  if (globalResult.failures.length > 0 || routeResult.failures.length > 0) {
    console.error("\nAsset budget check failed.");
    process.exit(1);
  }
  console.log("\nAsset budget check passed.");
}
