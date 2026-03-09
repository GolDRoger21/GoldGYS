#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "docs", "releases");
const SUGGESTION_PATH = path.join(RELEASE_DIR, "release-headroom-suggestion.json");

function parseArg(name, fallback) {
  const arg = process.argv.find((item) => item.startsWith(`${name}=`));
  if (!arg) return fallback;
  const value = arg.slice(name.length + 1).trim();
  return value || fallback;
}

function parseNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function readSuggestion() {
  if (!fs.existsSync(SUGGESTION_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SUGGESTION_PATH, "utf8"));
  } catch {
    return null;
  }
}

const requestedGlobal = parseArg("--global", "1");
const requestedRisk = parseArg("--risk", "0.75");
const suggestion = readSuggestion();
const suggestedGlobal = parseNumber(suggestion?.suggested?.minGlobalHeadroomKb, 1);
const suggestedRisk = parseNumber(suggestion?.suggested?.minRiskHeadroomKb, 0.75);

const resolvedGlobal =
  requestedGlobal.toLowerCase() === "auto" ? suggestedGlobal : parseNumber(requestedGlobal, suggestedGlobal);
const resolvedRisk =
  requestedRisk.toLowerCase() === "auto" ? suggestedRisk : parseNumber(requestedRisk, suggestedRisk);

process.stdout.write(
  JSON.stringify(
    {
      requested: {
        global: requestedGlobal,
        risk: requestedRisk
      },
      resolved: {
        global: resolvedGlobal,
        risk: resolvedRisk
      },
      suggested: {
        global: suggestedGlobal,
        risk: suggestedRisk
      },
      suggestionSource: fs.existsSync(SUGGESTION_PATH)
        ? path.relative(ROOT, SUGGESTION_PATH).replace(/\\/g, "/")
        : null
    },
    null,
    2
  )
);
