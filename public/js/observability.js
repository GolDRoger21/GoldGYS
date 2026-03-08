import { analytics } from "./firebase-config.js";
import { logEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const STORAGE_KEY = "goldgys_observability_v1";
const MAX_ERROR_LOG_ENTRIES = 50;

function getStartOfWeek(now = Date.now()) {
  const d = new Date(now);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (_) {}
}

function ensureStore() {
  const weekStart = getStartOfWeek();
  const existing = readStore();
  if (existing && existing.weekStart === weekStart) return existing;
  return {
    weekStart,
    firestore: { read: 0, write: 0, listenEvents: 0 },
    collections: {},
    page: {},
    errors: []
  };
}

function persistWith(mutator) {
  const state = ensureStore();
  mutator(state);
  writeStore(state);
}

function currentPageKey() {
  if (typeof window === "undefined") return "unknown";
  return `${location.pathname}${location.search}`;
}

function markPageMetrics() {
  if (typeof window === "undefined") return;
  const pageKey = currentPageKey();
  const navigation = performance.getEntriesByType("navigation")[0];
  if (!navigation) return;
  const resources = performance.getEntriesByType("resource");
  const scriptBytes = resources
    .filter((entry) => entry.initiatorType === "script")
    .reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
  const cssBytes = resources
    .filter((entry) => entry.initiatorType === "link")
    .reduce((sum, entry) => sum + (entry.transferSize || 0), 0);

  persistWith((state) => {
    state.page[pageKey] = {
      firstPaintMs: Math.round(navigation.responseStart || 0),
      domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd || 0),
      loadEventMs: Math.round(navigation.loadEventEnd || 0),
      scriptKb: Number((scriptBytes / 1024).toFixed(2)),
      cssKb: Number((cssBytes / 1024).toFixed(2)),
      measuredAt: new Date().toISOString()
    };
  });

  trackAnalyticsEvent("page_metrics_sample", {
    page: pageKey,
    dcl_ms: Math.round(navigation.domContentLoadedEventEnd || 0),
    load_ms: Math.round(navigation.loadEventEnd || 0),
    script_kb: Number((scriptBytes / 1024).toFixed(2)),
    css_kb: Number((cssBytes / 1024).toFixed(2))
  });
}

export function trackFirestoreOp(op, collection = "unknown") {
  const normalized = op === "write" ? "write" : op === "listen" ? "listenEvents" : "read";
  persistWith((state) => {
    state.firestore[normalized] = (state.firestore[normalized] || 0) + 1;
    if (!state.collections[collection]) {
      state.collections[collection] = { read: 0, write: 0, listenEvents: 0 };
    }
    state.collections[collection][normalized] += 1;
  });
}

function pushErrorLog(entry) {
  persistWith((state) => {
    if (!Array.isArray(state.errors)) state.errors = [];
    state.errors.unshift(entry);
    if (state.errors.length > MAX_ERROR_LOG_ENTRIES) {
      state.errors = state.errors.slice(0, MAX_ERROR_LOG_ENTRIES);
    }
  });
}

function normalizeErrorPayload(rawError) {
  if (!rawError) return { name: "UnknownError", message: "Unknown error", stack: "" };
  if (rawError instanceof Error) {
    return {
      name: rawError.name || "Error",
      message: rawError.message || String(rawError),
      stack: rawError.stack || ""
    };
  }
  return {
    name: "NonErrorThrown",
    message: typeof rawError === "string" ? rawError : JSON.stringify(rawError),
    stack: ""
  };
}

export function trackJsError(error, context = "runtime", extra = {}) {
  const normalized = normalizeErrorPayload(error);
  const entry = {
    at: new Date().toISOString(),
    page: currentPageKey(),
    context,
    ...normalized,
    ...extra
  };

  pushErrorLog(entry);
  trackAnalyticsEvent("client_js_error", {
    context,
    page: entry.page,
    name: normalized.name || "Error"
  });
}

export function trackAnalyticsEvent(eventName, params = {}) {
  if (!analytics) return;
  try {
    logEvent(analytics, eventName, params);
  } catch (_) {}
}

export function getWeeklyObservabilityReport() {
  return ensureStore();
}

export function initObservability() {
  if (typeof window === "undefined") return;
  if (window.__goldgysObservabilityInitialized) return;
  window.__goldgysObservabilityInitialized = true;

  if (document.readyState === "complete") {
    markPageMetrics();
  } else {
    window.addEventListener("load", () => markPageMetrics(), { once: true });
  }

  window.addEventListener("error", (event) => {
    trackJsError(event.error || event.message, "window.error", {
      source: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    trackJsError(event.reason, "window.unhandledrejection");
  });

  trackAnalyticsEvent("app_bootstrap", { page: currentPageKey() });
  window.__goldgysGetObservability = getWeeklyObservabilityReport;
}
