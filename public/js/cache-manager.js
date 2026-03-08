import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
        this.initPromise = this._open();
    }

    _open() {
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

    // FIX (Hata 3): init başarısız olsa bile null db üzerinde crash olmasın
    async _ensureDb() {
        if (this.db) return this.db;
        // initPromise daha önce reject olmuşsa tekrar dene
        this.db = null;
        this.initPromise = this._open();
        return this.initPromise;
    }

    async put(storeName, data, key = null) {
        const db = await this._ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = key ? store.put(data, key) : store.put(data);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async get(storeName, key) {
        const db = await this._ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        const db = await this._ensureDb();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

const idb = new IndexedDBCache();
const CACHE_BUSTER_STORAGE_KEY = 'goldgys_cache_buster';
const CACHE_BUSTER_SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 saat

let cacheBusterSyncPromise = null;
let lastCacheBusterSyncAt = 0;

function readLocalCacheBuster() {
    const rawValue = localStorage.getItem(CACHE_BUSTER_STORAGE_KEY);
    const parsed = Number(rawValue || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function persistLocalCacheBuster(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) return;
    localStorage.setItem(CACHE_BUSTER_STORAGE_KEY, String(normalized));
}

// FIX (Hata 1 + 6): Önce DB'yi sil, silemedikten SONRA init'i yenile.
// Önceki kodda idb.init() hemen çağrılıyordu ve onblocked'ı tetikleyerek
// silme işlemini engelliyordu (race condition).
async function clearGoldGysLocalCaches() {
    try {
        // Mevcut bağlantıyı kapat ve referansı sıfırla
        if (idb.db) {
            idb.db.close();
            idb.db = null;
        }

        // DB tamamen silinene kadar bekle
        await new Promise((resolve) => {
            const request = indexedDB.deleteDatabase(DB_NAME);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
            request.onblocked = () => {
                // Mevcut bağlantı zaten kapatıldı; kısa bekleyip tekrar dene
                setTimeout(() => {
                    indexedDB.deleteDatabase(DB_NAME);
                    resolve(false);
                }, 200);
            };
        });

        // Silme tamamlandıktan sonra yeni bağlantı aç
        idb.initPromise = idb._open();
    } catch (error) {
        console.warn('GoldGYSCache temizlenemedi:', error);
        // Hata olsa da DB'yi yeniden açmayı dene
        idb.initPromise = idb._open();
    }
}

async function syncCacheBusterFromServer(force = false) {
    const now = Date.now();
    if (!force && now - lastCacheBusterSyncAt < CACHE_BUSTER_SYNC_INTERVAL) {
        return;
    }
    if (cacheBusterSyncPromise) return cacheBusterSyncPromise;

    cacheBusterSyncPromise = (async () => {
        try {
            const snap = await getDoc(doc(db, 'config', 'public'));
            const remoteValue = Number(snap.data()?.system?.cacheBuster || 0);
            const localValue = readLocalCacheBuster();

            if (Number.isFinite(remoteValue) && remoteValue > 0) {
                if (remoteValue > localValue) {
                    await clearGoldGysLocalCaches();
                }
                persistLocalCacheBuster(remoteValue);
            }
        } catch (error) {
            // Ağ yoksa veya kullanıcı anonimse sessizce devam et
        } finally {
            lastCacheBusterSyncAt = Date.now();
            cacheBusterSyncPromise = null;
        }
    })();

    return cacheBusterSyncPromise;
}

export const CacheManager = {
    // --- GENERIC ---

    async syncCacheBuster(force = false) {
        await syncCacheBusterFromServer(force);
    },

    // FIX (Hata 2): saveData artık her çağrıda Firestore'u okumaz.
    // syncCacheBusterFromServer çağrısı kaldırıldı; cache buster kontrolü
    // zaten getData() okuma öncesinde yapılıyor.
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

    // FIX (Hata 2): deleteData artık her çağrıda Firestore'u okumaz.
    async deleteData(key) {
        try {
            await idb.delete(STORES.METADATA, key);
        } catch (e) {
            console.warn('DeleteData failed', e);
        }
    },

    async getData(key, maxAge = null) {
        try {
            // Okuma öncesi cache buster senkronizasyonu — bu yeterli.
            await syncCacheBusterFromServer();
            const record = await idb.get(STORES.METADATA, key);
            if (!record) return null;
            const effectiveTtl = Number.isFinite(maxAge) && maxAge > 0 ? Math.min(record.ttl || DEFAULT_TTL, maxAge) : (record.ttl || DEFAULT_TTL);
            if (Date.now() - record.timestamp > effectiveTtl) {
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
            await Promise.all(ids.map(async (id) => {
                const q = await this.getQuestion(id);
                if (q) results.set(id, q);
            }));
        } catch (e) { }
        return results;
    },

    // --- DRAFTS ---
    // FIX (Hata 2): clearDraftAnswers artık her çağrıda Firestore'u okumaz.
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
        // FIX (Hata 2): syncCacheBusterFromServer kaldırıldı
        const key = `draft_${scopeKey}`;
        try {
            await idb.delete(STORES.DRAFTS, key);
        } catch (e) { }
    },

    // --- LEGACY ADAPTERS ---
    // FIX (Hata 4): saveTopicPackIndexes artık async — saveData'yı await ediyor
    async saveTopicPackIndexes(topicId, indexes) {
        await this.saveData(`indexes_${topicId}`, indexes);
    },

    // FIX (Hata 5): maxAge artık getData'ya iletiliyor
    async getTopicPackIndexes(topicId, maxAge) {
        const res = await this.getData(`indexes_${topicId}`, maxAge);
        return res?.data || null;
    }
};
