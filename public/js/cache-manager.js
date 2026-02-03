const DB_NAME = 'GoldGYSCache';
const DB_VERSION = 1;
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 saat

const STORES = {
    QUESTIONS: 'questions',
    PACKS: 'packs',
    METADATA: 'metadata',
    DRAFTS: 'drafts'
};

class IndexedDBCache {
    constructor() {
        this.db = null;
        this.initPromise = this.init();
    }

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                if (!db.objectStoreNames.contains(STORES.QUESTIONS)) {
                    db.createObjectStore(STORES.QUESTIONS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(STORES.PACKS)) {
                    db.createObjectStore(STORES.PACKS, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORES.METADATA)) {
                    db.createObjectStore(STORES.METADATA, { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains(STORES.DRAFTS)) {
                    db.createObjectStore(STORES.DRAFTS, { keyPath: 'key' });
                }
            };
        });
    }

    async put(storeName, data, key = null) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = key ? store.put(data, key) : store.put(data);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, key) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        await this.initPromise;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

const idb = new IndexedDBCache();

export const CacheManager = {
    // --- GENERIC ---
    async saveData(key, data, ttl = DEFAULT_TTL) {
        const payload = {
            key,
            data,
            timestamp: Date.now(),
            ttl
        };
        try {
            await idb.put(STORES.METADATA, payload);
        } catch (e) {
            console.warn('SaveData failed', e);
        }
    },

    async getData(key) {
        try {
            const record = await idb.get(STORES.METADATA, key);
            if (!record) return null;
            if (Date.now() - record.timestamp > record.ttl) {
                await idb.delete(STORES.METADATA, key);
                return null;
            }
            return { cached: true, data: record.data };
        } catch (e) {
            console.warn('GetData failed', e);
            return null;
        }
    },

    // --- PACKS (Topic Packs) ---
    async savePack(key, data) {
        const payload = {
            key,
            data,
            timestamp: Date.now()
        };
        try {
            await idb.put(STORES.PACKS, payload);
        } catch (e) {
            console.warn('SavePack failed', e);
        }
    },

    async getPack(key, maxAge = DEFAULT_TTL) {
        try {
            const record = await idb.get(STORES.PACKS, key);
            if (!record) return null;
            if (Date.now() - record.timestamp > maxAge) {
                await idb.delete(STORES.PACKS, key);
                return null;
            }
            return record.data;
        } catch (e) {
            return null;
        }
    },

    // --- QUESTIONS (Individual Cache) ---
    async saveQuestion(question) {
        if (!question?.id) return;
        const payload = {
            id: question.id,
            ...question,
            _cachedAt: Date.now()
        };
        try {
            await idb.put(STORES.QUESTIONS, payload);
        } catch (e) { /* ignore */ }
    },

    async getQuestion(id) {
        try {
            const q = await idb.get(STORES.QUESTIONS, id);
            return q || null;
        } catch (e) {
            return null;
        }
    },

    async getQuestions(ids) {
        const results = new Map();
        try {
            // Batch get optimization could be done here with cursor, 
            // but for simplicity we do parallel gets
            await Promise.all(ids.map(async (id) => {
                const q = await this.getQuestion(id);
                if (q) results.set(id, q);
            }));
        } catch (e) { }
        return results;
    },

    // --- DRAFTS ---
    async saveDraftAnswer(scopeKey, questionId, answerPayload) {
        const key = `draft_${scopeKey}`;
        try {
            let record = await idb.get(STORES.DRAFTS, key);
            if (!record) {
                record = { key, answers: {}, updatedAt: 0 };
            }
            record.answers[questionId] = answerPayload;
            record.updatedAt = Date.now();
            await idb.put(STORES.DRAFTS, record);
        } catch (e) {
            console.warn('SaveDraft failed', e);
        }
    },

    async getDraftAnswers(scopeKey) {
        const key = `draft_${scopeKey}`;
        try {
            const record = await idb.get(STORES.DRAFTS, key);
            return record?.answers || {};
        } catch (e) {
            return {};
        }
    },

    async clearDraftAnswers(scopeKey) {
        const key = `draft_${scopeKey}`;
        try {
            await idb.delete(STORES.DRAFTS, key);
        } catch (e) { }
    },

    // --- LEGACY ADAPTERS (For existing calls) ---
    saveTopicPackIndexes(topicId, indexes) {
        this.saveData(`indexes_${topicId}`, indexes);
    },

    async getTopicPackIndexes(topicId, maxAge) {
        const res = await this.getData(`indexes_${topicId}`);
        return res?.data || null;
    }
};
