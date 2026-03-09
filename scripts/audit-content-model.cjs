#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "public", "js");
const STRICT = process.argv.includes("--strict");

const findings = [];

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && full.endsWith(".js")) out.push(full);
  }
  return out;
}

function lineNumber(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function hasHelperInWindow(content, index, helperPattern) {
  const start = Math.max(0, index - 2500);
  const chunk = content.slice(start, index);
  helperPattern.lastIndex = 0;
  return helperPattern.test(chunk);
}

function checkPattern(filePath, content, regex, helperPattern, message) {
  let match;
  while ((match = regex.exec(content)) !== null) {
    const at = match.index;
    if (!hasHelperInWindow(content, at, helperPattern)) {
      findings.push(`${filePath}:${lineNumber(content, at)} ${message}`);
    }
  }
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");

  const questionAddDocPattern =
    /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*["']questions["']\s*\)\s*,/g;
  const questionBatchSetPattern =
    /batch\.set\s*\(\s*[^,]*doc\s*\(\s*collection\s*\(\s*db\s*,\s*["']questions["']\s*\)\s*\)\s*,/g;
  const topicAddDocPattern =
    /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*["']topics["']\s*\)\s*,/g;
  const lessonAddDocPattern =
    /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*`topics\/\$\{[^}]+\}\/lessons`\s*\)\s*,/g;
  const examAddDocPattern =
    /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*["']exams["']\s*\)\s*,/g;
  const configPublicSetDocPattern =
    /setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*["']config["']\s*,\s*["']public["']\s*\)\s*,/g;
  const legalPageSetDocPattern =
    /setDoc\s*\(\s*doc\s*\(\s*db\s*,\s*["']legal_pages["']\s*,/g;
  const announcementAddDocPattern =
    /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*["']announcements["']\s*\)\s*,/g;
  const examAnnouncementBatchSetPattern =
    /batch\.set\s*\(\s*newDocRef\s*,/g;

  checkPattern(
    filePath,
    content,
    questionAddDocPattern,
    /applyQuestionModelDefaults\s*\(/g,
    "questions write appears without applyQuestionModelDefaults(...) nearby."
  );
  checkPattern(
    filePath,
    content,
    questionBatchSetPattern,
    /applyQuestionModelDefaults\s*\(/g,
    "questions batch write appears without applyQuestionModelDefaults(...) nearby."
  );
  checkPattern(
    filePath,
    content,
    topicAddDocPattern,
    /applyTopicModelDefaults\s*\(/g,
    "topics write appears without applyTopicModelDefaults(...) nearby."
  );
  checkPattern(
    filePath,
    content,
    lessonAddDocPattern,
    /applyLessonModelDefaults\s*\(/g,
    "lessons write appears without applyLessonModelDefaults(...) nearby."
  );
  checkPattern(
    filePath,
    content,
    examAddDocPattern,
    /applyExamModelDefaults\s*\(/g,
    "exams write appears without applyExamModelDefaults(...) nearby."
  );
  checkPattern(
    filePath,
    content,
    configPublicSetDocPattern,
    /applyConfigPublicModelDefaults\s*\(/g,
    "config/public write appears without applyConfigPublicModelDefaults(...) nearby."
  );
  checkPattern(
    filePath,
    content,
    legalPageSetDocPattern,
    /applyLegalPageModelDefaults\s*\(/g,
    "legal_pages write appears without applyLegalPageModelDefaults(...) nearby."
  );
  checkPattern(
    filePath,
    content,
    announcementAddDocPattern,
    /applyAnnouncementModelDefaults\s*\(/g,
    "announcements write appears without applyAnnouncementModelDefaults(...) nearby."
  );
  checkPattern(
    filePath,
    content,
    examAnnouncementBatchSetPattern,
    /applyExamAnnouncementModelDefaults\s*\(/g,
    "examAnnouncements batch write appears without applyExamAnnouncementModelDefaults(...) nearby."
  );
}

if (!fs.existsSync(ROOT)) {
  console.error(`[audit-content-model] Root not found: ${ROOT}`);
  process.exit(1);
}

const files = walk(ROOT);
files.forEach(scanFile);

if (findings.length === 0) {
  console.log("[audit-content-model] Passed. No model standard drift detected.");
  process.exit(0);
}

console.warn("[audit-content-model] Findings:");
for (const finding of findings) {
  console.warn(` - ${finding}`);
}

if (STRICT) {
  console.error("[audit-content-model] Strict mode failed.");
  process.exit(1);
}

console.warn("[audit-content-model] Completed with warnings (non-strict mode).");
