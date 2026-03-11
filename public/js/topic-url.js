const TURKISH_CHAR_MAP = {
  'ç': 'c', 'Ç': 'c',
  'ğ': 'g', 'Ğ': 'g',
  'ı': 'i', 'İ': 'i',
  'ö': 'o', 'Ö': 'o',
  'ş': 's', 'Ş': 's',
  'ü': 'u', 'Ü': 'u'
};

export function slugifyTopicTitle(title = '') {
  return String(title)
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (char) => TURKISH_CHAR_MAP[char] || char)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildTopicPath(topicOrId, title = '') {
  if (topicOrId && typeof topicOrId === 'object') {
    const topic = topicOrId;
    // Stale DB slug'ları yoksayıyoruz, her zaman güncel başlıktan URL türet.
    const slug = (slugifyTopicTitle(topic.title || '') || topic.id || '').trim();
    return `/konu/${encodeURIComponent(slug)}`;
  }

  if (typeof topicOrId === 'string' && title) {
    const slug = slugifyTopicTitle(title) || topicOrId;
    return `/konu/${encodeURIComponent(slug)}`;
  }

  const fallback = String(topicOrId || '').trim();
  return `/konu/${encodeURIComponent(fallback)}`;
}

function isShellNavigationPreferred() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("shell") === "1") return false;
    if (params.get("shellV2") === "0") return false;
    if (params.get("shellV2") === "1") return true;

    const pathname = window.location.pathname || "";
    if (pathname === "/dashboard") return true;
    return localStorage.getItem("userShellV2") === "1";
  } catch {
    return false;
  }
}

export function buildTopicHref(topicOrId, title = '') {
  const topicPath = buildTopicPath(topicOrId, title);
  if (!isShellNavigationPreferred()) return topicPath;
  const routeKey = topicPath.replace(/^\//, "");
  return `/dashboard#${routeKey}`;
}
