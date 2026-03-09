#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "public", "js", "content-model.js");

function fail(message) {
  console.error(`[content-model-contract] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(FILE)) {
  fail(`File not found: ${FILE}`);
}

const source = fs.readFileSync(FILE, "utf8");

const requiredDefaults = [
  "QUESTION_MODEL_DEFAULTS",
  "TOPIC_MODEL_DEFAULTS",
  "LESSON_MODEL_DEFAULTS",
  "EXAM_MODEL_DEFAULTS",
  "CONFIG_PUBLIC_MODEL_DEFAULTS",
  "LEGAL_PAGE_MODEL_DEFAULTS",
  "ANNOUNCEMENT_MODEL_DEFAULTS",
  "EXAM_ANNOUNCEMENT_MODEL_DEFAULTS",
];

const requiredApplyFns = [
  "applyQuestionModelDefaults",
  "applyTopicModelDefaults",
  "applyLessonModelDefaults",
  "applyExamModelDefaults",
  "applyConfigPublicModelDefaults",
  "applyLegalPageModelDefaults",
  "applyAnnouncementModelDefaults",
  "applyExamAnnouncementModelDefaults",
];

const requiredValidateFns = [
  "validateQuestionPayload",
  "validateTopicPayload",
  "validateLessonPayload",
  "validateExamPayload",
  "validateConfigPublicPayload",
  "validateLegalPagePayload",
  "validateAnnouncementPayload",
  "validateExamAnnouncementPayload",
];

for (const symbol of requiredDefaults) {
  if (!source.includes(`export const ${symbol}`)) {
    fail(`Missing export: ${symbol}`);
  }
}

for (const fn of requiredApplyFns) {
  if (!source.includes(`export function ${fn}`)) {
    fail(`Missing apply function: ${fn}`);
  }
}

for (const fn of requiredValidateFns) {
  if (!source.includes(`export function ${fn}`)) {
    fail(`Missing validate function: ${fn}`);
  }
}

for (const symbol of requiredDefaults) {
  const blockPattern = new RegExp(
    `export const ${symbol}\\s*=\\s*Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\);`,
    "m"
  );
  const block = source.match(blockPattern)?.[1] || "";
  if (!block.includes("version: CONTENT_SCHEMA_VERSION")) {
    fail(`${symbol} does not include version: CONTENT_SCHEMA_VERSION`);
  }
  if (!block.includes('status: "active"')) {
    fail(`${symbol} does not include status: "active"`);
  }
  if (!block.includes('visibility: "public"')) {
    fail(`${symbol} does not include visibility: "public"`);
  }
}

if (!source.includes("const MAX_DOC_BYTES_SOFT_LIMIT = 750000;")) {
  fail("MAX_DOC_BYTES_SOFT_LIMIT contract changed or missing.");
}

console.log("[content-model-contract] Passed.");
