#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");
const HISTORY_PATH = path.join(RELEASE_DIR, "release-history.json");

function fail(message) {
  console.error(`[release-history] ${message}`);
  process.exit(1);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function readStatusFiles() {
  if (!fs.existsSync(RELEASE_DIR)) return [];
  const files = fs
    .readdirSync(RELEASE_DIR)
    .filter((name) => /^release-status-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort();

  const entries = [];
  for (const file of files) {
    const full = path.join(RELEASE_DIR, file);
    try {
      const raw = fs.readFileSync(full, "utf8");
      const json = JSON.parse(raw);
      entries.push({
        date: json.date || file.replace("release-status-", "").replace(".json", ""),
        decision: String(json.decision || "UNKNOWN").toUpperCase(),
        commit: json.commit || "",
        version: json.version || "",
        lcpUserIndex: json?.cwv?.userIndexLcp || null,
        lcpAdminIndex: json?.cwv?.adminIndexLcp || null,
        budgetHeadroomKb: {
          total: toNumber(json?.budget?.globalTotal?.headroomKb),
          js: toNumber(json?.budget?.globalJs?.headroomKb),
          css: toNumber(json?.budget?.globalCss?.headroomKb),
          html: toNumber(json?.budget?.globalHtml?.headroomKb)
        }
      });
    } catch (error) {
      console.warn(`[release-history] Skipped invalid status file: ${file} (${error.message})`);
    }
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

function summarize(entries) {
  const totals = entries.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.decision === "GO") acc.go += 1;
      if (item.decision === "NO-GO") acc.noGo += 1;
      return acc;
    },
    { total: 0, go: 0, noGo: 0 }
  );

  const last = entries[entries.length - 1] || null;
  return { totals, last };
}

if (!fs.existsSync(RELEASE_DIR)) {
  fail(`Release directory not found: ${RELEASE_DIR}`);
}

const entries = readStatusFiles();
const output = {
  generatedAt: new Date().toISOString(),
  count: entries.length,
  summary: summarize(entries),
  entries
};

fs.writeFileSync(HISTORY_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`[release-history] Updated: ${path.relative(ROOT, HISTORY_PATH)}`);
