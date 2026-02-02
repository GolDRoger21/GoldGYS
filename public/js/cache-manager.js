const DEFAULT_PACK_TTL = 24 * 60 * 60 * 1000; // 24 saat
const DEFAULT_INDEX_TTL = 24 * 60 * 60 * 1000;
const CACHE_VERSION = 'v1';

function buildKey(prefix, key) {
    return `${prefix}_${CACHE_VERSION}_${key}`;
}

function safeParse(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn('[CacheManager] JSON parse hatası', error);
        return null;
    }
}

export const CacheManager = {
    savePack(key, data) {
        if (!key) return;
        const payload = {
            timestamp: Date.now(),
            data
        };
        localStorage.setItem(buildKey('pack', key), JSON.stringify(payload));
    },

    getPack(key, maxAge = DEFAULT_PACK_TTL) {
        if (!key) return null;
        const payload = safeParse(localStorage.getItem(buildKey('pack', key)));
        if (!payload?.data || !payload?.timestamp) return null;
        if (Date.now() - payload.timestamp > maxAge) return null;
        return payload.data;
    },

    saveTopicPackIndexes(topicId, indexes) {
        if (!topicId || !Array.isArray(indexes)) return;
        const payload = {
            timestamp: Date.now(),
            data: indexes
        };
        localStorage.setItem(buildKey('pack_indexes', topicId), JSON.stringify(payload));
    },

    getTopicPackIndexes(topicId, maxAge = DEFAULT_INDEX_TTL) {
        if (!topicId) return null;
        const payload = safeParse(localStorage.getItem(buildKey('pack_indexes', topicId)));
        if (!payload?.data || !payload?.timestamp) return null;
        if (Date.now() - payload.timestamp > maxAge) return null;
        return payload.data;
    },

    saveDraftAnswer(scopeKey, questionId, answerPayload) {
        if (!scopeKey || !questionId) return;
        const storageKey = buildKey('draft', scopeKey);
        const payload = safeParse(localStorage.getItem(storageKey)) || { answers: {}, updatedAt: 0 };
        payload.answers[questionId] = answerPayload;
        payload.updatedAt = Date.now();
        localStorage.setItem(storageKey, JSON.stringify(payload));
    },

    getDraftAnswers(scopeKey) {
        if (!scopeKey) return {};
        const payload = safeParse(localStorage.getItem(buildKey('draft', scopeKey)));
        return payload?.answers || {};
    },

    clearDraftAnswers(scopeKey) {
        if (!scopeKey) return;
        localStorage.removeItem(buildKey('draft', scopeKey));
    }
};
