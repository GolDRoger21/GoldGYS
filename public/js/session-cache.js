export function readSessionCache(cacheKey, ttlMs = null, options = {}) {
    try {
        const cachedRaw = sessionStorage.getItem(cacheKey);
        if (!cachedRaw) return null;

        const parsed = JSON.parse(cachedRaw);
        const allowLegacy = Boolean(options.allowLegacy);

        if (!parsed || typeof parsed !== "object" || !parsed._cachedAt || !("data" in parsed)) {
            return allowLegacy ? parsed : null;
        }

        if (Number.isFinite(ttlMs) && ttlMs > 0 && (Date.now() - parsed._cachedAt) > ttlMs) {
            sessionStorage.removeItem(cacheKey);
            return null;
        }

        return parsed.data;
    } catch (error) {
        if (typeof options.onError === "function") options.onError(error);
        return null;
    }
}

export function writeSessionCache(cacheKey, data, options = {}) {
    try {
        sessionStorage.setItem(cacheKey, JSON.stringify({
            _cachedAt: Date.now(),
            data
        }));
    } catch (error) {
        if (typeof options.onError === "function") options.onError(error);
    }
}

export function clearSessionByPrefix(prefix) {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(prefix)) {
            sessionStorage.removeItem(key);
        }
    }
}

export function getSessionValue(key) {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

export function setSessionValue(key, value) {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // no-op
    }
}

export function removeSessionValue(key) {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // no-op
    }
}