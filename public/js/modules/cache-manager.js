export const CacheManager = {
    set(key, value, ttl = 5 * 60 * 1000) { // Default TTL: 5 minutes
        const item = {
            value: value,
            expiry: Date.now() + ttl,
        };
        try {
            sessionStorage.setItem(key, JSON.stringify(item));
        } catch (e) {
            console.warn('Cache quota exceeded, clearing old items...');
            sessionStorage.clear(); // Simple strategy: clear all if full
            try {
                sessionStorage.setItem(key, JSON.stringify(item));
            } catch (retryError) {
                console.error('Failed to set cache even after clearing:', retryError);
            }
        }
    },

    get(key) {
        const itemStr = sessionStorage.getItem(key);
        if (!itemStr) return null;

        try {
            const item = JSON.parse(itemStr);
            const now = Date.now();

            if (now > item.expiry) {
                sessionStorage.removeItem(key);
                return null;
            }
            return item.value;
        } catch (e) {
            console.error('Error parsing cache item:', e);
            sessionStorage.removeItem(key);
            return null;
        }
    },

    remove(key) {
        sessionStorage.removeItem(key);
    },

    clear() {
        sessionStorage.clear();
    },

    // Helper for specific patterns
    clearByPrefix(prefix) {
        Object.keys(sessionStorage).forEach(key => {
            if (key.startsWith(prefix)) {
                sessionStorage.removeItem(key);
            }
        });
    }
};
