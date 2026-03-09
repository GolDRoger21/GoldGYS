export const CONTENT_SCHEMA_VERSION = 1;

export const QUESTION_MODEL_DEFAULTS = Object.freeze({
  version: CONTENT_SCHEMA_VERSION,
  status: "active",
  visibility: "public",
});

export const TOPIC_MODEL_DEFAULTS = Object.freeze({
  version: CONTENT_SCHEMA_VERSION,
  status: "active",
  visibility: "public",
});

export const LESSON_MODEL_DEFAULTS = Object.freeze({
  version: CONTENT_SCHEMA_VERSION,
  status: "active",
  visibility: "public",
});

export const EXAM_MODEL_DEFAULTS = Object.freeze({
  version: CONTENT_SCHEMA_VERSION,
  status: "active",
  visibility: "public",
});

export const CONFIG_PUBLIC_MODEL_DEFAULTS = Object.freeze({
  version: CONTENT_SCHEMA_VERSION,
  status: "active",
  visibility: "public",
});

export const LEGAL_PAGE_MODEL_DEFAULTS = Object.freeze({
  version: CONTENT_SCHEMA_VERSION,
  status: "active",
  visibility: "public",
});

export const ANNOUNCEMENT_MODEL_DEFAULTS = Object.freeze({
  version: CONTENT_SCHEMA_VERSION,
  status: "active",
  visibility: "public",
});

export const EXAM_ANNOUNCEMENT_MODEL_DEFAULTS = Object.freeze({
  version: CONTENT_SCHEMA_VERSION,
  status: "active",
  visibility: "public",
});

const MAX_DOC_BYTES_SOFT_LIMIT = 750000;

function estimatePayloadBytes(payload) {
  try {
    return new Blob([JSON.stringify(payload)]).size;
  } catch (error) {
    return 0;
  }
}

export function applyQuestionModelDefaults(payload = {}) {
  const next = {
    ...payload,
    ...QUESTION_MODEL_DEFAULTS,
  };
  return next;
}

export function applyTopicModelDefaults(payload = {}) {
  return {
    ...payload,
    ...TOPIC_MODEL_DEFAULTS,
  };
}

export function applyLessonModelDefaults(payload = {}) {
  return {
    ...payload,
    ...LESSON_MODEL_DEFAULTS,
  };
}

export function applyExamModelDefaults(payload = {}) {
  return {
    ...payload,
    ...EXAM_MODEL_DEFAULTS,
  };
}

export function applyConfigPublicModelDefaults(payload = {}) {
  return {
    ...payload,
    ...CONFIG_PUBLIC_MODEL_DEFAULTS,
  };
}

export function applyLegalPageModelDefaults(payload = {}) {
  return {
    ...payload,
    ...LEGAL_PAGE_MODEL_DEFAULTS,
  };
}

export function applyAnnouncementModelDefaults(payload = {}) {
  return {
    ...payload,
    ...ANNOUNCEMENT_MODEL_DEFAULTS,
  };
}

export function applyExamAnnouncementModelDefaults(payload = {}) {
  return {
    ...payload,
    ...EXAM_ANNOUNCEMENT_MODEL_DEFAULTS,
  };
}

export function validateQuestionPayload(payload = {}) {
  const warnings = [];

  if (!String(payload.text || "").trim()) {
    warnings.push("text alanı boş.");
  }

  const options = Array.isArray(payload.options) ? payload.options : [];
  if (options.length < 2) {
    warnings.push("options en az 2 öğe içermeli.");
  }

  const correct = String(payload.correctOption || "").trim();
  if (!correct) {
    warnings.push("correctOption alanı boş.");
  } else if (!options.some((option) => String(option?.id || "").trim() === correct)) {
    warnings.push("correctOption, options içinde eşleşen bir id değil.");
  }

  const sizeBytes = estimatePayloadBytes(payload);
  if (sizeBytes > MAX_DOC_BYTES_SOFT_LIMIT) {
    warnings.push(`doküman boyutu yüksek (${sizeBytes} bytes).`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    sizeBytes,
  };
}

export function validateTopicPayload(payload = {}) {
  const warnings = [];
  if (!String(payload.title || "").trim()) {
    warnings.push("title is empty.");
  }

  const sizeBytes = estimatePayloadBytes(payload);
  if (sizeBytes > MAX_DOC_BYTES_SOFT_LIMIT) {
    warnings.push(`payload size is high (${sizeBytes} bytes).`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    sizeBytes,
  };
}

export function validateLessonPayload(payload = {}) {
  const warnings = [];
  if (!String(payload.title || "").trim()) {
    warnings.push("title is empty.");
  }

  const lessonType = String(payload.type || "").trim();
  if (!lessonType) {
    warnings.push("type is empty.");
  }

  const sizeBytes = estimatePayloadBytes(payload);
  if (sizeBytes > MAX_DOC_BYTES_SOFT_LIMIT) {
    warnings.push(`payload size is high (${sizeBytes} bytes).`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    sizeBytes,
  };
}

export function validateExamPayload(payload = {}) {
  const warnings = [];
  if (!String(payload.title || "").trim()) {
    warnings.push("title is empty.");
  }

  const duration = Number(payload.duration || 0);
  if (!Number.isFinite(duration) || duration <= 0) {
    warnings.push("duration must be a positive number.");
  }

  const totalQuestions = Number(payload.totalQuestions || 0);
  if (!Number.isFinite(totalQuestions) || totalQuestions < 0) {
    warnings.push("totalQuestions is invalid.");
  }

  const sizeBytes = estimatePayloadBytes(payload);
  if (sizeBytes > MAX_DOC_BYTES_SOFT_LIMIT) {
    warnings.push(`payload size is high (${sizeBytes} bytes).`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    sizeBytes,
  };
}

export function validateConfigPublicPayload(payload = {}) {
  const warnings = [];
  if (!payload || typeof payload !== "object") {
    warnings.push("payload is not an object.");
  }

  const sizeBytes = estimatePayloadBytes(payload);
  if (sizeBytes > MAX_DOC_BYTES_SOFT_LIMIT) {
    warnings.push(`payload size is high (${sizeBytes} bytes).`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    sizeBytes,
  };
}

export function validateLegalPagePayload(payload = {}) {
  const warnings = [];
  if (!String(payload.title || "").trim()) {
    warnings.push("title is empty.");
  }
  if (!String(payload.content || "").trim()) {
    warnings.push("content is empty.");
  }

  const sizeBytes = estimatePayloadBytes(payload);
  if (sizeBytes > MAX_DOC_BYTES_SOFT_LIMIT) {
    warnings.push(`payload size is high (${sizeBytes} bytes).`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    sizeBytes,
  };
}

export function validateAnnouncementPayload(payload = {}) {
  const warnings = [];
  if (!String(payload.title || "").trim()) {
    warnings.push("title is empty.");
  }

  const sizeBytes = estimatePayloadBytes(payload);
  if (sizeBytes > MAX_DOC_BYTES_SOFT_LIMIT) {
    warnings.push(`payload size is high (${sizeBytes} bytes).`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    sizeBytes,
  };
}

export function validateExamAnnouncementPayload(payload = {}) {
  const warnings = [];
  if (!String(payload.title || "").trim()) {
    warnings.push("title is empty.");
  }
  if (!payload.examDate) {
    warnings.push("examDate is empty.");
  }

  const sizeBytes = estimatePayloadBytes(payload);
  if (sizeBytes > MAX_DOC_BYTES_SOFT_LIMIT) {
    warnings.push(`payload size is high (${sizeBytes} bytes).`);
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    sizeBytes,
  };
}
