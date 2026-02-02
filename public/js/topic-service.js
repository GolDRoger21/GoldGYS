import { db, auth } from "./firebase-config.js";
import {
    doc, getDoc, setDoc, collection, query, where, getDocs,
    serverTimestamp, deleteDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Saat

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
                if (Date.now() - timestamp < CACHE_DURATION && Array.isArray(ids) && ids.length > 0) {
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
                return {
                    solvedIds: data.solvedIds || [], // Çözülen soru ID'leri (Array)
                    lastDocId: data.lastDocId || null, // Sıralı mod için son kalınan yer
                    totalSolved: (data.solvedIds || []).length
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

        try {
            const docRef = doc(db, `users/${userId}/topic_progress/${topicId}`);
            const docSnap = await getDoc(docRef);
            let currentSolved = [];

            if (docSnap.exists()) {
                currentSolved = docSnap.data().solvedIds || [];
            }

            // Tekrarları önlemek için Set kullanımı
            const updatedSolved = [...new Set([...currentSolved, ...newSolvedIds])];

            await setDoc(docRef, {
                solvedIds: updatedSolved,
                lastUpdate: serverTimestamp(),
                topicId: topicId // Indexleme için
            }, { merge: true });

            console.log(`${newSolvedIds.length} yeni soru ilerlemeye eklendi.`);
        } catch (error) {
            console.error("İlerleme kaydedilemedi:", error);
        }
    },

    /**
     * Konu ilerlemesini sıfırlar.
     */
    async resetProgress(userId, topicId) {
        if (!userId || !topicId) return;

        try {
            await deleteDoc(doc(db, `users/${userId}/topic_progress/${topicId}`));
            console.log("İlerleme sıfırlandı.");
            return true;
        } catch (error) {
            console.error("Sıfırlama hatası:", error);
            return false;
        }
    }
};
