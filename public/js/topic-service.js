import { db, auth } from "./firebase-config.js";
import {
    doc, getDoc, setDoc, collection, query, where, getDocs,
    serverTimestamp, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { CacheManager } from "./cache-manager.js";

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Saat
const PACK_CACHE_DURATION = 24 * 60 * 60 * 1000;
const PACK_INDEX_CACHE_DURATION = 24 * 60 * 60 * 1000;
const PACK_META_CACHE_DURATION = 24 * 60 * 60 * 1000;

const topicPackMetaMemoryCache = new Map();

export const TopicService = {

    /**
     * Bir konu için tüm aktif soru ID'lerini getirir.
     * Önce LocalStorage'a bakar, yoksa Firestore'dan çeker ve cache'ler.
     * Bu sayede "Random" modunda gereksiz okuma maliyeti önlenir.
     * @param {string} topicTitle - Konu başlığı (Kategori)
     * @returns {Promise<string[]>} Soru ID listesi
     */
    async getTopicQuestionIds(topicTitle) {
        if (!topicTitle) return [];

        const cacheKey = `topic_ids_${btoa(unescape(encodeURIComponent(topicTitle)))}`;
        const cachedData = localStorage.getItem(cacheKey);

        if (cachedData) {
            try {
                const { timestamp, ids } = JSON.parse(cachedData);
                if (Date.now() - timestamp < CACHE_DURATION && Array.isArray(ids)) {
                    console.log(`[Cache Hit] ${topicTitle} için ${ids.length} soru ID'si yerel hafızadan alındı.`);
                    return ids;
                }
            } catch (e) {
                console.warn("Cache parse hatası, yenileniyor...", e);
            }
        }

        // Cache yoksa veya süresi dolduysa Firestore'dan çek
        console.log(`[Cache Miss] ${topicTitle} için soru ID'leri Firestore'dan çekiliyor...`);
        try {
            // Sadece ID'leri çekmek için hafif bir sorgu yapıyoruz
            // Not: Firestore'da sadece ID getiren özel bir metod yok, ancak
            // metadata ile dönen veri miktarını kısıtlayabiliriz veya sadece gerekli alanları.
            // Fakat client SDK'da 'select' projeksiyonu tam da bu işe yarar ama JS SDK'da sınırlı.
            // Yine de collection query yapacağız.
            const q = query(
                collection(db, "questions"),
                where("category", "==", topicTitle),
                where("isActive", "==", true)
            );

            const snapshot = await getDocs(q);
            const ids = snapshot.docs.map(doc => doc.id);

            // Cache'e kaydet
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                ids: ids
            }));

            return ids;
        } catch (error) {
            console.error("Soru ID'leri çekilemedi:", error);
            return [];
        }
    },

    async getTopicPackMeta(topicId) {
        if (!topicId) return null;

        try {
            if (topicPackMetaMemoryCache.has(topicId)) {
                return topicPackMetaMemoryCache.get(topicId);
            }

            const cacheKey = `topic_pack_meta_${topicId}`;
            const cached = CacheManager.getData(cacheKey, PACK_META_CACHE_DURATION);
            if (cached?.cached) {
                topicPackMetaMemoryCache.set(topicId, cached.data);
                return cached.data;
            }

            const metaSnap = await getDoc(doc(db, `topic_packs_meta/${topicId}`));
            const metaData = metaSnap.exists() ? metaSnap.data() : null;
            CacheManager.saveData(cacheKey, metaData);
            topicPackMetaMemoryCache.set(topicId, metaData);
            return metaData;
        } catch (error) {
            console.warn("Paket meta verisi okunamadı:", error);
            return null;
        }
    },

    async getTopicPackIndexes(topicId) {
        if (!topicId) return [];

        const cached = CacheManager.getTopicPackIndexes(topicId, PACK_INDEX_CACHE_DURATION);
        if (Array.isArray(cached)) {
            return cached;
        }

        try {
            const fallbackQuery = query(
                collection(db, "topic_packs"),
                where("topicId", "==", topicId)
            );
            const fallbackSnap = await getDocs(fallbackQuery);
            const indexes = fallbackSnap.docs
                .map(docSnap => {
                    const data = docSnap.data();
                    if (Number.isInteger(data?.packIndex)) {
                        return data.packIndex;
                    }
                    const match = docSnap.id?.match(/_pack_(\d+)$/);
                    return match ? Number(match[1]) : null;
                })
                .filter(index => Number.isInteger(index));

            const uniqueIndexes = Array.from(new Set(indexes));
            CacheManager.saveTopicPackIndexes(topicId, uniqueIndexes);
            return uniqueIndexes;
        } catch (error) {
            console.warn("Paket indeksleri okunamadı:", error);
            return [];
        }
    },

    async fetchQuestionPack(topicId, options = {}) {
        if (!topicId) return null;

        const meta = await this.getTopicPackMeta(topicId);
        const packCount = meta?.packCount || 0;
        let packIndex = Number.isInteger(options.packIndex) ? options.packIndex : null;
        let availableIndexes = [];

        if (!Number.isInteger(packIndex)) {
            if (packCount > 0) {
                availableIndexes = Array.from({ length: packCount }, (_, index) => index);
            } else {
                availableIndexes = await this.getTopicPackIndexes(topicId);
            }

            packIndex = availableIndexes.length > 0
                ? availableIndexes[Math.floor(Math.random() * availableIndexes.length)]
                : 0;
        }

        const cacheKey = `${topicId}_pack_${packIndex}`;
        const cached = CacheManager.getPack(cacheKey, PACK_CACHE_DURATION);
        if (cached) {
            return { ...cached, packIndex, cacheKey };
        }

        try {
            const packId = `${topicId}_pack_${packIndex}`;
            let packSnap = await getDoc(doc(db, "topic_packs", packId));

            if (!packSnap.exists()) {
                const fallbackQuery = query(
                    collection(db, "topic_packs"),
                    where("topicId", "==", topicId)
                );
                const fallbackSnap = await getDocs(fallbackQuery);
                if (fallbackSnap.empty) {
                    return null;
                }
                if (fallbackSnap.docs.length > 1) {
                    const docs = fallbackSnap.docs;
                    packSnap = docs[Math.floor(Math.random() * docs.length)];
                } else {
                    packSnap = fallbackSnap.docs[0] || null;
                }

                const fallbackIndexes = fallbackSnap.docs
                    .map(docSnap => docSnap.data()?.packIndex)
                    .filter(index => Number.isInteger(index));
                if (fallbackIndexes.length > 0) {
                    CacheManager.saveTopicPackIndexes(topicId, Array.from(new Set(fallbackIndexes)));
                }
            }

            if (!packSnap || !packSnap.exists()) return null;

            const packData = packSnap.data();
            const resolvedPackIndex = packData.packIndex ?? packIndex;
            const resolvedCacheKey = packSnap.id || `${topicId}_pack_${resolvedPackIndex}`;
            const payload = {
                questions: packData.questions || [],
                topicId: packData.topicId,
                packIndex: resolvedPackIndex
            };

            CacheManager.savePack(resolvedCacheKey, payload);
            return { ...payload, cacheKey: resolvedCacheKey };
        } catch (error) {
            console.error("Soru paketi çekilemedi:", error);
            return null;
        }
    },

    /**
     * Kullanıcının bu konudaki ilerlemesini çeker.
     * @param {string} userId
     * @param {string} topicId
     * @returns {Promise<{solvedIds: string[], lastDocId: string|null, totalSolved: number}>}
     */
    async getUserProgress(userId, topicId) {
        if (!userId || !topicId) return { solvedIds: [], lastDocId: null, totalSolved: 0 };

        try {
            const docRef = doc(db, `users/${userId}/topic_progress/${topicId}`);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const data = docSnap.data();
                const answers = data.answers || {};
                const solvedIds = Array.isArray(data.solvedIds)
                    ? data.solvedIds
                    : Object.keys(answers);
                return {
                    solvedIds: solvedIds, // Çözülen soru ID'leri (Array)
                    answers: answers,
                    lastDocId: data.lastDocId || null, // Sıralı mod için son kalınan yer
                    totalSolved: solvedIds.length
                };
            }
        } catch (error) {
            console.error("İlerleme verisi çekilemedi:", error);
        }

        return { solvedIds: [], lastDocId: null, totalSolved: 0 };
    },

    /**
     * Kullanıcının çözdüğü soruları kaydeder.
     * @param {string} userId
     * @param {string} topicId
     * @param {string[]} newSolvedIds - Yeni çözülen soru ID'leri
     */
    async saveProgress(userId, topicId, newSolvedIds) {
        if (!userId || !topicId || !newSolvedIds.length) return;
        const answers = newSolvedIds.reduce((acc, id) => {
            acc[id] = true;
            return acc;
        }, {});
        await this.syncProgress(userId, topicId, answers);
    },

    async syncProgress(userId, topicId, answers) {
        if (!userId || !topicId || !answers || Object.keys(answers).length === 0) return;

        try {
            const docRef = doc(db, `users/${userId}/topic_progress/${topicId}`);
            const docSnap = await getDoc(docRef);
            const existingAnswers = docSnap.exists() ? (docSnap.data().answers || {}) : {};
            const merged = { ...existingAnswers, ...answers };

            await setDoc(docRef, {
                topicId: topicId,
                answers: merged,
                solvedCount: Object.keys(merged).length,
                lastSyncedAt: serverTimestamp()
            }, { merge: true });

            console.log(`${Object.keys(answers).length} cevap toplu olarak senkronize edildi.`);
        } catch (error) {
            console.error("İlerleme senkronizasyonu başarısız:", error);
        }
    },

    /**
     * Konu ilerlemesini sıfırlar.
     */
    async resetProgress(userId, topicId) {
        if (!userId || !topicId) return;

        try {
            await deleteDoc(doc(db, `users/${userId}/topic_progress/${topicId}`));
            CacheManager.clearDraftAnswers(`topic_${topicId}`);
            console.log("İlerleme sıfırlandı.");
            return true;
        } catch (error) {
            console.error("Sıfırlama hatası:", error);
            return false;
        }
    }
};
