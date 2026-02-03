import { db } from "./firebase-config.js";
import { CacheManager } from "./cache-manager.js";
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const SUMMARY_CACHE_TTL = 60 * 60 * 1000; // 1 saat

function normalizeTimestamp(value) {
    if (!value) return null;
    if (value.seconds) return new Date(value.seconds * 1000);
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareDates(a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    return a.getTime() - b.getTime();
}

function aggregateWrongSummaries(docs) {
    const summaryMap = new Map();

    docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const wrongCounts = data.wrongCounts || {};
        const questionMeta = data.questionMeta || {};
        const docUpdatedAt = normalizeTimestamp(data.updatedAt);

        Object.entries(wrongCounts).forEach(([questionId, count]) => {
            if (!questionId) return;
            const meta = questionMeta[questionId] || {};
            const metaLastAttempt = normalizeTimestamp(meta.lastAttempt);
            const lastAttempt = compareDates(metaLastAttempt, docUpdatedAt) >= 0 ? metaLastAttempt : docUpdatedAt;
            const safeCount = Number.isFinite(count) ? count : 0;

            if (!summaryMap.has(questionId)) {
                summaryMap.set(questionId, {
                    questionId,
                    count: safeCount,
                    text: meta.text || '',
                    category: meta.category || 'Genel',
                    examId: meta.examId || null,
                    lastAttempt
                });
                return;
            }

            const existing = summaryMap.get(questionId);
            existing.count += safeCount;
            if (meta.text) existing.text = meta.text;
            if (meta.category) existing.category = meta.category;
            if (meta.examId) existing.examId = meta.examId;
            if (compareDates(existing.lastAttempt, lastAttempt) < 0) {
                existing.lastAttempt = lastAttempt;
            }
        });
    });

    return Array.from(summaryMap.values()).sort((a, b) => compareDates(b.lastAttempt, a.lastAttempt));
}

export const WrongSummaryService = {
    async getUserWrongSummary(uid) {
        if (!uid) return [];
        const cacheKey = `wrong_summary_${uid}`;
        const cached = await CacheManager.getData(cacheKey);
        if (cached?.cached && Array.isArray(cached.data)) {
            return cached.data;
        }

        try {
            const summariesQuery = query(
                collection(db, `users/${uid}/wrong_summaries`),
                orderBy("updatedAt", "desc")
            );
            const snapshot = await getDocs(summariesQuery);
            const summary = aggregateWrongSummaries(snapshot.docs);
            await CacheManager.saveData(cacheKey, summary, SUMMARY_CACHE_TTL);
            return summary;
        } catch (error) {
            console.warn("Yanlış özetleri okunamadı:", error);
            return [];
        }
    },

    /**
     * Test bitiminde yerel cache'i manuel günceller (Optimistic UI)
     * @param {string} uid 
     * @param {Array} newWrongList - [{ questionId, text, category, examId }]
     */
    async updateCacheWithNewWrongs(uid, newWrongList) {
        if (!uid || !newWrongList || newWrongList.length === 0) return;

        const cacheKey = `wrong_summary_${uid}`;
        const cached = await CacheManager.getData(cacheKey);

        // Eğer cache yoksa veya süresi dolmuşsa, bir şey yapmaya gerek yok;
        // bir sonraki girişte taze veri çekilecek zaten.
        // Ama "hemen görünsün" istiyorsak ve cache boşsa, en azından bu yenileri ekleyebiliriz.
        // Fakat listenin tamamı elimizde olmadığı için sadece yenileri göstermek eksik olabilir.
        // Güvenli yöntem: Sadece mevcut cache varsa güncellemek.

        let currentSummary = (cached?.cached && Array.isArray(cached.data)) ? cached.data : [];
        if (currentSummary.length === 0 && (!cached || !cached.cached)) {
            // Cache yoksa, mecburen elle oluşturmak riskli olabilir 
            // (eskiler eksik kalır). Bu yüzden cache yoksa karışmıyoruz,
            // kullanıcı sayfaya gidince fresh data çekecek.
            return;
        }

        const now = new Date();

        newWrongList.forEach(item => {
            const existingIndex = currentSummary.findIndex(x => x.questionId === item.questionId);
            if (existingIndex > -1) {
                // Güncelle
                currentSummary[existingIndex].count += 1;
                currentSummary[existingIndex].lastAttempt = now;
                // Text vb güncelleyelim mi?
                if (item.text) currentSummary[existingIndex].text = item.text;
            } else {
                // Ekle
                currentSummary.push({
                    questionId: item.questionId,
                    count: 1,
                    text: item.text || '',
                    category: item.category || 'Genel',
                    examId: item.examId || null,
                    lastAttempt: now
                });
            }
        });

        // Yeniden sırala (En son çözülen en üstte)
        currentSummary.sort((a, b) => compareDates(b.lastAttempt, a.lastAttempt));

        // Cache'i güncelle (Süreyi de resetleyelim mi? Hayır, orijinal TTL korunsun)
        // Ancak CacheManager.saveData timestamp'i yeniler. Bu da TTL'i uzatır.
        // Bu istenen bir durum mu? Evet, aktif kullanıcı cache'i taze tutsun.
        await CacheManager.saveData(cacheKey, currentSummary, SUMMARY_CACHE_TTL);
    }
};
