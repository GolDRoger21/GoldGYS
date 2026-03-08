const STORAGE_KEY = 'goldgys_observability_v1';

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
    if (!parsed || typeof parsed !== 'object') return null;
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
    page: {}
  };
}

function persistWith(mutator) {
  const state = ensureStore();
  mutator(state);
  writeStore(state);
}

function markPageMetrics() {
  const pageKey = `${location.pathname}${location.search}`;
  const navigation = performance.getEntriesByType('navigation')[0];
  if (!navigation) return;
  const resources = performance.getEntriesByType('resource');
  const scriptBytes = resources.filter((entry) => entry.initiatorType === 'script').reduce((sum, entry) => sum + (entry.transferSize || 0), 0);
  const cssBytes = resources.filter((entry) => entry.initiatorType === 'link').reduce((sum, entry) => sum + (entry.transferSize || 0), 0);

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
}

export function trackFirestoreOp(op, collection = 'unknown') {
  const normalized = op === 'write' ? 'write' : (op === 'listen' ? 'listenEvents' : 'read');
  persistWith((state) => {
    state.firestore[normalized] = (state.firestore[normalized] || 0) + 1;
    if (!state.collections[collection]) {
      state.collections[collection] = { read: 0, write: 0, listenEvents: 0 };
    }
    state.collections[collection][normalized] += 1;
  });
}

export function getWeeklyObservabilityReport() {
  return ensureStore();
}

export function initObservability() {
  if (typeof window === 'undefined') return;
  if (window.__goldgysObservabilityInitialized) return;
  window.__goldgysObservabilityInitialized = true;

  if (document.readyState === 'complete') {
    markPageMetrics();
  } else {
    window.addEventListener('load', () => markPageMetrics(), { once: true });
  }

  window.__goldgysGetObservability = getWeeklyObservabilityReport;
}
