import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, documentId, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from "./firestore-metrics.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showConfirm, showToast } from "./notifications.js";
import { TopicService } from "./topic-service.js";
import { buildTopicHref } from "./topic-url.js";
import { CacheManager } from "./cache-manager.js";
import { USER_CACHE_KEYS } from "./cache-keys.js";

const ANALYSIS_CACHE_TTL = 30 * 60 * 1000; // 30 dakika
const ANALYSIS_PROGRESS_RESET_FETCH_LIMIT = 1000;
const ANALYSIS_PROGRESS_RESET_WRITE_CHUNK = 100;
const ANALYSIS_TOPIC_META_FETCH_LIMIT = 8;

const state = {
    userId: null,
    results: [],
    topics: [],
    progressMap: new Map(),
    successMap: new Map(),
    currentTopicId: null,
    statsResetAt: null,
    topicResets: {},
    charts: { progress: null, topic: null }
};

let analysisPageInitialized = false;
let analysisAuthUnsubscribe = null;

export function initAnalysisPage() {
    if (analysisPageInitialized) return;
    analysisPageInitialized = true;
    analysisAuthUnsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        state.userId = user.uid;
        bindUIEvents();
        await initAnalysis(user.uid);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initAnalysisPage();
});

export function disposeAnalysisPage() {
    if (typeof analysisAuthUnsubscribe === "function") {
        analysisAuthUnsubscribe();
        analysisAuthUnsubscribe = null;
    }
    if (state.charts.progress && typeof state.charts.progress.destroy === "function") {
        state.charts.progress.destroy();
        state.charts.progress = null;
    }
    if (state.charts.topic && typeof state.charts.topic.destroy === "function") {
        state.charts.topic.destroy();
        state.charts.topic = null;
    }
    analysisPageInitialized = false;
}


function getEffectiveTopics(topics = state.topics) {
    const childParentIds = new Set(topics.filter(t => t?.parentId).map(t => t.parentId));
    return topics.filter(topic => !childParentIds.has(topic.id));
}

function getTopicCompletionSummary() {
    const effectiveTopics = getEffectiveTopics();
    const completed = effectiveTopics.filter(topic => getTopicStatus(topic.id) === 'completed').length;
    const remaining = Math.max(0, effectiveTopics.length - completed);
    return { completed, remaining, total: effectiveTopics.length };
}
function parseNum(v) {
    const num = Number(v);
    return Number.isFinite(num) ? num : 0;
}

function getExamTotal(exam) {
    const total = parseNum(exam.total);
    if (total > 0) return total;
    return parseNum(exam.correct) + parseNum(exam.wrong) + parseNum(exam.empty);
}

function getTopicQuestionTotal(topic, progress = null) {
    return [
        topic?._fetchedTotal,
        topic?.totalQuestions,
        topic?.questionCount,
        topic?.questionsCount,
        topic?.targetQuestions,
        topic?.stats?.totalQuestions,
        topic?.meta?.totalQuestions,
        progress?.totalQuestions,
        progress?.questionCount,
        progress?.questionsCount
    ].map(parseNum).find(v => v > 0) || 0;
}

function getProgressSolvedCount(progress = {}) {
    return Math.max(
        parseNum(progress?.solvedCount),
        parseNum(progress?.answeredCount),
        parseNum(progress?.correctCount) + parseNum(progress?.wrongCount),
        parseNum(progress?.stats?.solvedCount),
        parseNum(progress?.stats?.correct) + parseNum(progress?.stats?.wrong),
        Array.isArray(progress?.solvedIds) ? progress.solvedIds.length : 0,
        Array.isArray(progress?.answered) ? progress.answered.length : 0,
        progress?.answers ? Object.keys(progress.answers).length : 0
    );
}

function getCompletedSeconds(exam) {
    return exam?.completedAt?.seconds || null;
}

function getExamScore(exam) {
    const explicitScore = parseNum(exam?.score);
    if (explicitScore > 0) return explicitScore;
    const total = getExamTotal(exam);
    return total ? Math.round((parseNum(exam.correct) / total) * 100) : 0;
}

function normalizeResetTimestamp(timestamp) {
    if (!timestamp) return null;
    if (typeof timestamp.seconds === 'number') return timestamp.seconds;
    if (typeof timestamp.toDate === 'function') return Math.floor(timestamp.toDate().getTime() / 1000);
    return null;
}

function normalizeTopicResets(topicResets = {}) {
    return Object.entries(topicResets).reduce((acc, [topicId, timestamp]) => {
        const seconds = normalizeResetTimestamp(timestamp);
        if (seconds) acc[topicId] = seconds;
        return acc;
    }, {});
}

function resolveCurrentTopicId(currentTopicId, currentTopicUpdatedAt, statsResetAt, topicResets) {
    if (!currentTopicId) return null;
    if (statsResetAt && (!currentTopicUpdatedAt || currentTopicUpdatedAt <= statsResetAt)) return null;
    const topicResetAt = topicResets?.[currentTopicId];
    if (topicResetAt && (!currentTopicUpdatedAt || currentTopicUpdatedAt <= topicResetAt)) return null;
    return currentTopicId;
}

function applyGlobalReset(results, resetAtSeconds) {
    if (!resetAtSeconds) return results;
    return results.filter(result => {
        const completedAt = getCompletedSeconds(result);
        if (!completedAt) return true;
        return completedAt > resetAtSeconds;
    });
}

async function initAnalysis(userId) {
    try {
        const fetchTopics = async () => {
            const cachedTopics = await CacheManager.getData('all_topics', 24 * 60 * 60 * 1000);
            if (cachedTopics?.cached && cachedTopics.data) {
                console.log("[Cache] Konular IndexedDB'den yüklendi (/analiz)");
                return cachedTopics.data;
            } else {
                const topicsSnap = await getDocs(query(collection(db, "topics"), orderBy("order", "asc"), limit(500)), "topics");
                const allTopics = topicsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.isActive !== false && t.status !== 'deleted' && t.isDeleted !== true);
                await CacheManager.saveData('all_topics', allTopics, 24 * 60 * 60 * 1000);
                console.log("[Network] Konular Firestore'dan çekildi ve önbelleğe alındı.");
                return allTopics;
            }
        };

        const fetchResults = async () => {
            const resultsCacheKey = USER_CACHE_KEYS.examResultsCollection(userId);
            const cachedResults = await CacheManager.getData(resultsCacheKey, ANALYSIS_CACHE_TTL);
            if (cachedResults?.cached && cachedResults.data) {
                return cachedResults.data;
            } else {
                const resultsQuery = query(collection(db, `users/${userId}/exam_results`), orderBy('completedAt', 'desc'), limit(100));
                const resultSnap = await getDocs(resultsQuery, "users.exam_results");
                const rawResults = resultSnap.docs.map(d => d.data());
                await CacheManager.saveData(resultsCacheKey, rawResults, ANALYSIS_CACHE_TTL);
                return rawResults;
            }
        };

        const fetchProgress = async () => {
            const progressColCacheKey = USER_CACHE_KEYS.topicProgressCollection(userId);
            const cachedProgCol = await CacheManager.getData(progressColCacheKey, ANALYSIS_CACHE_TTL);
            if (cachedProgCol?.cached && cachedProgCol.data) {
                return cachedProgCol.data;
            } else {
                const progressSnap = await getDocs(
                    query(collection(db, `users/${userId}/topic_progress`), orderBy(documentId()), limit(500)),
                    "users.topic_progress"
                );
                const progressMapDocs = progressSnap.docs.map(d => ({ id: d.id, data: d.data() }));
                await CacheManager.saveData(progressColCacheKey, progressMapDocs, ANALYSIS_CACHE_TTL);
                return progressMapDocs;
            }
        };

        const fetchUser = async () => {
            const userCacheKey = USER_CACHE_KEYS.userProfile(userId);
            const cachedUser = await CacheManager.getData(userCacheKey, ANALYSIS_CACHE_TTL);
            if (cachedUser?.cached && cachedUser.data) {
                return { exists: () => true, data: () => cachedUser.data };
            }

            const userSnap = await getDoc(doc(db, "users", userId));
            if (userSnap.exists()) {
                await CacheManager.saveData(userCacheKey, userSnap.data(), ANALYSIS_CACHE_TTL);
            }
            return userSnap;
        };

        // Verileri paralel olarak asenkron başlatıyoruz ki sayfa açılış gecikmesi yaşanmasın (Waterfall'ı kırıyoruz)
        const [allTopics, rawResults, progressMapDocs, userSnap] = await Promise.all([
            fetchTopics(),
            fetchResults(),
            fetchProgress(),
            fetchUser()
        ]);

        const userData = userSnap.exists() ? userSnap.data() : {};
        state.statsResetAt = normalizeResetTimestamp(userData.statsResetAt);
        state.topicResets = normalizeTopicResets(userData.topicResets);
        state.currentTopicId = resolveCurrentTopicId(
            userData.currentTopicId,
            normalizeResetTimestamp(userData.currentTopicUpdatedAt),
            state.statsResetAt,
            state.topicResets
        );

        state.results = applyGlobalReset(rawResults, state.statsResetAt);
        state.topics = allTopics;

        await hydrateTopicTotals(state.topics);

        state.progressMap = new Map(progressMapDocs.map(d => [d.id, d.data]));

        const categoryTotals = buildCategoryTotals(state.results, state.topics, state.topicResets);
        state.successMap = buildTopicSuccessMap(state.topics, categoryTotals);
        renderAnalysisState(categoryTotals);
    } catch (error) {
        console.error("Analiz hatası:", error);
        const updateEl = document.getElementById('lastUpdate');
        updateEl.innerText = 'Veriler yüklenemedi';
        updateEl.classList.remove('status-in-progress');
        updateEl.classList.add('status-pending');
        showToast('Analiz verisi yüklenirken hata oluştu.', 'error');
    }
}

function setLastUpdateState() {
    const updateEl = document.getElementById('lastUpdate');
    updateEl.innerText = `Son Güncelleme: ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
    updateEl.classList.remove('status-in-progress');
    updateEl.classList.add('status-completed');
}

function renderAnalysisState(categoryTotals = null) {
    const totals = categoryTotals || buildCategoryTotals(state.results, state.topics, state.topicResets);
    state.successMap = buildTopicSuccessMap(state.topics, totals);
    calculateKPIs(state.results);
    calculatePredictedScore(state.results);
    renderProgressChart(state.results);
    renderTopicChart(totals);
    renderHistoryTable(state.results);
    renderLevelSystem();
    renderScientificInsights(totals);
    setLastUpdateState();
}

async function runChunked(tasks, chunkSize) {
    for (let i = 0; i < tasks.length; i += chunkSize) {
        await Promise.all(tasks.slice(i, i + chunkSize).map((task) => task()));
    }
}
async function syncCachedUserProfilePatch(userId, patch = {}) {
    if (!userId || !patch || typeof patch !== 'object') return;
    const userCacheKey = USER_CACHE_KEYS.userProfile(userId);
    const cachedUser = await CacheManager.getData(userCacheKey, ANALYSIS_CACHE_TTL);
    const baseUser = (cachedUser?.cached && cachedUser?.data && typeof cachedUser.data === 'object')
        ? cachedUser.data
        : {};
    await CacheManager.saveData(userCacheKey, { ...baseUser, ...patch }, ANALYSIS_CACHE_TTL);
}

async function hydrateTopicTotals(topics) {
    const unresolved = [];
    for (const topic of topics) {
        const totalFromDoc = getTopicQuestionTotal(topic);
        if (totalFromDoc > 0) {
            topic._fetchedTotal = totalFromDoc;
            continue;
        }

        const cacheKey = `topic_pack_meta_${topic.id}`;
        const cachedMeta = await CacheManager.getData(cacheKey, 24 * 60 * 60 * 1000);
        const cachedCount = parseNum(cachedMeta?.data?.questionCount);
        if (cachedCount > 0) {
            topic._fetchedTotal = cachedCount;
            continue;
        }
        unresolved.push(topic);
    }

    // Firestore kotasını korumak için sadece sınırlı sayıda eksik konu için canlı metadata okuması.
    await Promise.all(unresolved.slice(0, ANALYSIS_TOPIC_META_FETCH_LIMIT).map(async (topic) => {
        try {
            const meta = await TopicService.getTopicPackMeta(topic.id);
            const count = parseNum(meta?.questionCount || (Array.isArray(meta?.questionIds) ? meta.questionIds.length : 0));
            if (count > 0) topic._fetchedTotal = count;
        } catch (err) {
            console.warn('Topic meta read skipped:', err);
        }
    }));
}

function isDenemeExam(exam) {
    const title = (exam.examTitle || '').toLowerCase();
    if (title.includes('deneme')) return true;

    // Eğer konu testi veya smart test değilse (örn. mode === 'exam' veya categoryStats çok genişse)
    const cats = Object.keys(exam.categoryStats || {});
    if (cats.length > 2 && !title.includes('yanlış')) return true;

    return false;
}

function calculateKPIs(results) {
    const denemeResults = results.filter(isDenemeExam);
    const totalExams = denemeResults.length;

    // Gerçek sınav verilerinden puanları çek
    const totalScore = results.reduce((sum, exam) => sum + parseNum(exam.score), 0);
    const avgScore = totalExams ? Math.round(totalScore / totalExams) : 0;

    const totalQuestions = results.reduce((sum, exam) => sum + getExamTotal(exam), 0);
    const totalCorrect = results.reduce((sum, exam) => sum + parseNum(exam.correct), 0);
    const totalWrong = results.reduce((sum, exam) => sum + parseNum(exam.wrong), 0);

    // Hata Oranı
    const wrongRate = totalQuestions ? Math.round((totalWrong / totalQuestions) * 100) : 0;

    document.getElementById('totalExams').innerText = totalExams;
    document.getElementById('totalQuestions').innerText = totalQuestions;
    document.getElementById('wrongRate').innerText = `%${wrongRate}`;
}

function calculatePredictedScore(results) {
    const recent = results;
    if (!recent.length) {
        document.getElementById('predictedScore').innerText = '--';
        return;
    }

    // YENİ MANTIK: 80 Soru = 100 Puan. (Yani 1 Doğru = 1.25 Puan).
    // Yanlışlar doğruları götürmemektedir.

    let totalCorrects = 0;
    let totalQuestions = 0;

    recent.forEach((exam) => {
        totalCorrects += parseNum(exam.correct);
        const examTotalQs = getExamTotal(exam) || (parseNum(exam.correct) + parseNum(exam.wrong)) || 1;
        totalQuestions += examTotalQs;
    });

    if (totalQuestions <= 0) {
        document.getElementById('predictedScore').innerText = '--';
        return;
    }

    // Soruların yüzde kaçını doğru yaptı?
    const successRatio = totalCorrects / totalQuestions;

    // 100 Puan üzerinden tahmini puanı (maks 100)
    const predictedBase100 = Math.min(100, Math.round(successRatio * 100));

    document.getElementById('predictedScore').innerText = `${predictedBase100} Puan`;
    document.getElementById('predictedScore').style.fontSize = "clamp(2rem, 1.5rem + 3vw, 3rem)"; // Text'e uyumlu font küçültmesi
}

function ensureChartDestroy(chartKey) {
    if (state.charts[chartKey]) state.charts[chartKey].destroy();
}

function renderProgressChart(results) {
    ensureChartDestroy('progress');
    const denemeResults = results.filter(isDenemeExam);
    const chartData = [...denemeResults].slice(0, 12).reverse();
    const labels = chartData.length
        ? chartData.map(r => new Date(getCompletedSeconds(r) * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))
        : ['Veri Yok'];
    const data = chartData.length ? chartData.map(r => parseNum(r.score)) : [0];

    state.charts.progress = new Chart(document.getElementById('progressChart').getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Puan', data, borderColor: '#D4AF37', backgroundColor: 'rgba(212,175,55,.2)', fill: true, tension: 0.35 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
    });
}

function normalizeStr(str) {
    if (!str) return '';
    let s = str.toString().toLocaleLowerCase('tr-TR').trim();
    // Yalnızca görünmez boşlukları (zero-width vb), standart boşlukları, tire, nokta, virgül ve parantez gibi 
    // eşleşmeyi bozabilecek non-alfanümerik işaretleri temizleriz. 
    // Önceden \W_ kullanmak ç,ş,ğ,ü gibi harfleri bozuyordu, şimdi onu kaldırdık.
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
    s = s.replace(/[\s\-_.,;()'"]/g, '');
    return s;
}

function buildCategoryTotals(results, topics, topicResets) {
    const categoryTotals = {};
    topics.forEach(topic => { categoryTotals[topic.id] = { correct: 0, total: 0 }; });

    results.forEach(exam => {
        if (!exam.categoryStats) return;
        const completedAt = getCompletedSeconds(exam);
        Object.entries(exam.categoryStats).forEach(([cat, stats]) => {
            const normCat = normalizeStr(cat);
            // Kategori stringi ile Topic'leri daha güvenli bir şekilde eşleştir
            const topic = topics.find(t =>
                t.id === cat ||
                t.slug === cat ||
                normalizeStr(t.title) === normCat ||
                (t.shortName && normalizeStr(t.shortName) === normCat) ||
                (normCat.length > 5 && normalizeStr(t.title).includes(normCat)) ||
                (normCat.length > 5 && normCat.includes(normalizeStr(t.title)))
            );
            if (!topic) return;
            const resetAt = topicResets?.[topic.id];
            if (resetAt && completedAt && completedAt <= resetAt) return;
            categoryTotals[topic.id].correct += parseNum(stats.correct);
            categoryTotals[topic.id].total += parseNum(stats.total);
        });
    });
    return categoryTotals;
}

function buildTopicSuccessMap(topics, categoryTotals) {
    const map = new Map();
    topics.forEach(topic => {
        // İlerleme belgesi hem doc.id ile hem de topic.slug id'si ile kayıtlı olabilir
        const progress = state.progressMap.get(topic.id) || state.progressMap.get(topic.slug) || {};
        const solvedCount = getProgressSolvedCount(progress);
        const totalQuestions = getTopicQuestionTotal(topic, progress);

        // İstatistiklerin en son ne zaman sıfırlandığını kontrol edelim
        const progressUpdatedAt = normalizeResetTimestamp(progress?.updatedAt) || normalizeResetTimestamp(progress?.lastSyncedAt) || 0;
        const isReset = (state.statsResetAt && progressUpdatedAt <= state.statsResetAt) ||
            (state.topicResets?.[topic.id] && progressUpdatedAt <= state.topicResets[topic.id]);

        let successValue = 0;

        // Eğer ilerleme manuel sıfırlanmamışsa önce konu ilerlemesine bakalım
        if (!isReset && totalQuestions > 0 && solvedCount > 0) {
            successValue = Math.round((solvedCount / totalQuestions) * 100);
        } else {
            // İlerlemede veri yoksa en baştaki test analizlerinden (categoryTotals) gelen puanlamaya bakalım
            const stats = categoryTotals[topic.id];
            if (stats && stats.total > 0) {
                successValue = Math.round((stats.correct / stats.total) * 100);
            }
        }

        map.set(topic.id, Math.min(100, successValue));
    });
    return map;
}

function getTopicStatus(topicId) {
    const topic = state.topics.find(t => t.id === topicId) || {};
    const progress = state.progressMap.get(topicId) || state.progressMap.get(topic.slug) || {};

    const solvedCount = getProgressSolvedCount(progress);
    const progressUpdatedAt = normalizeResetTimestamp(progress?.updatedAt) || normalizeResetTimestamp(progress?.lastSyncedAt) || 0;

    if (state.statsResetAt && progressUpdatedAt <= state.statsResetAt) return 'pending';
    const topicResetAt = state.topicResets?.[topicId];
    if (topicResetAt && progressUpdatedAt <= topicResetAt) return 'pending';

    if (progress?.status === 'completed') return 'completed';
    // Test motorunda / konu tabında en az 1 soru bile çozmüşse (manuel veya sıfırlanma harici)
    if (solvedCount > 0) return 'in_progress';
    // CategoryTotals (sınavlardan) gelen success > 0 ise
    const successVal = state.successMap ? state.successMap.get(topicId) : 0;
    if (successVal > 0) return 'in_progress';

    if (progress?.status === 'in_progress' || topicId === state.currentTopicId) return 'in_progress';

    return 'pending';
}

function getBadgeHTMLForStatus(status) {
    if (status === 'completed') {
        return '<span class="status-badge badge-green"><span class="badge-dot"></span>Tamamlandı</span>';
    } else if (status === 'in_progress') {
        return '<span class="status-badge badge-blue"><span class="badge-dot pulse"></span>Çalışılıyor</span>';
    }
    return '<span class="status-badge badge-gray"><span class="badge-dot"></span>Başlanmadı</span>';
}

function getProgressColor(val) {
    if (val >= 80) return 'var(--color-success)';
    if (val >= 50) return 'var(--color-warning)';
    if (val > 0) return 'var(--color-danger)';
    return 'var(--border-color)';
}

function renderTopicChart(categoryTotals) {
    ensureChartDestroy('topic');
    const rows = state.topics
        .map(topic => ({ title: topic.title, success: state.successMap.get(topic.id) || 0, status: getTopicStatus(topic.id) }))
        .filter(row => row.status !== 'pending');

    const weakest = rows.sort((a, b) => a.success - b.success).slice(0, 8);
    const labels = weakest.length ? weakest.map(r => r.title.length > 20 ? r.title.substring(0, 20) + '...' : r.title) : ['Veri Yok'];
    const data = weakest.length ? weakest.map(r => r.success) : [0];

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? 'rgba(255,255,255,0.7)' : '#2F2516';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const tickColor = isDark ? 'rgba(255,255,255,0.5)' : '#7A6650';

    state.charts.topic = new Chart(document.getElementById('topicChart').getContext('2d'), {
        type: 'polarArea',
        data: {
            labels, datasets: [{
                label: 'Başarı', data, backgroundColor: [
                    'rgba(239, 68, 68, 0.7)', 'rgba(249, 115, 22, 0.7)', 'rgba(245, 158, 11, 0.7)',
                    'rgba(234, 179, 8, 0.7)', 'rgba(132, 204, 22, 0.7)', 'rgba(34, 197, 94, 0.7)',
                    'rgba(16, 185, 129, 0.7)', 'rgba(20, 184, 166, 0.7)'
                ], borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: textColor, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: %${ctx.raw}` } }
            },
            scales: { r: { ticks: { backdropColor: 'transparent', color: tickColor }, grid: { color: gridColor } } }
        }
    });
}

function renderHistoryTable(results) {
    const body = document.getElementById('historyTableBody');
    if (!results.length) {
        body.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 24px; color: var(--text-muted);">Henüz sınav verisi bulunmuyor. İlk denemeni çöz!</td></tr>';
        return;
    }

    // Filtreleme: Aynı sınav (examId) birden fazla kaydedilmişse en güncel olanı tut
    const uniqueResults = [];
    const seenExams = new Set();

    for (const r of results) {
        const uniqueKey = r.examId || `${r.topicId}_${getCompletedSeconds(r)}`;
        if (!seenExams.has(uniqueKey)) {
            uniqueResults.push(r);
            seenExams.add(uniqueKey);
        }
    }

    body.innerHTML = uniqueResults.slice(0, 12).map(r => {
        const completed = getCompletedSeconds(r);
        const dateObj = completed ? new Date(completed * 1000) : null;
        const date = dateObj ? dateObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

        const correctCount = parseNum(r.correct);
        const wrongCount = parseNum(r.wrong);
        const total = getExamTotal(r) || (correctCount + wrongCount) || 1; // avoid divide by zero
        const net = correctCount - (wrongCount * 0.25);
        const finalNet = net > 0 ? (net % 1 === 0 ? net : net.toFixed(2)) : 0;
        const correctPct = Math.round((correctCount / total) * 100);
        const wrongPct = Math.round((wrongCount / total) * 100);
        const score = getExamScore(r);

        let displayTopicTitle = r.examTitle || 'Genel Test';
        let isSmartTest = false;
        let smartTestBadge = '';
        const titleLower = displayTopicTitle.toLowerCase();

        if (r.mode === 'wrongs' || titleLower.includes('yanlış')) {
            isSmartTest = true;
            smartTestBadge = '<span class="status-badge badge-red" style="padding: 2px 6px; font-size: 0.65rem; margin-top:4px;"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align:text-bottom; margin-right:3px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>Yanlışlar Testi</span>';
        } else if (r.mode === 'random' || titleLower.includes('karışık')) {
            isSmartTest = true;
            smartTestBadge = '<span class="status-badge badge-gray" style="padding: 2px 6px; font-size: 0.65rem; margin-top:4px;"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align:text-bottom; margin-right:3px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path></svg>Karışık Tekrar</span>';
        }

        let topicSlug = null;
        let parentTopicName = r.topicTitle || '';

        if (r.topicId || r.categoryId) {
            const matchedTheme = state.topics.find(t => t.id === (r.topicId || r.categoryId) || t.slug === (r.topicId || r.categoryId));
            if (matchedTheme) {
                parentTopicName = matchedTheme.title;
                displayTopicTitle = isSmartTest ? matchedTheme.title : (r.examTitle || matchedTheme.title);
                topicSlug = matchedTheme.slug || matchedTheme.id;
                if (!matchedTheme.slug) topicSlug = normalizeStr(matchedTheme.title).replace(/\W+/g, '-');
            }
        }

        if (!topicSlug && parentTopicName) {
            const matchedByTitle = state.topics.find(t => normalizeStr(t.title) === normalizeStr(parentTopicName));
            if (matchedByTitle) topicSlug = matchedByTitle.slug || matchedByTitle.id;
        }

        // Fallback: If topic name isn't found above, try to guess from categoryStats or examId
        if (!parentTopicName) {
            if (r.categoryStats && Object.keys(r.categoryStats).length > 0) {
                const potentialCat = Object.keys(r.categoryStats)[0];
                const matchedTheme = state.topics.find(t => t.id === potentialCat || t.slug === potentialCat || normalizeStr(t.title) === normalizeStr(potentialCat));
                if (matchedTheme) {
                    parentTopicName = matchedTheme.title;
                    topicSlug = matchedTheme.slug || matchedTheme.id;
                }
            } else if (r.examId && r.examId.includes('_')) {
                const possibleSlug = r.examId.split('_')[0];
                const matchedTheme = state.topics.find(t => t.slug === possibleSlug || t.id.includes(possibleSlug));
                if (matchedTheme) {
                    parentTopicName = matchedTheme.title;
                    topicSlug = matchedTheme.slug || matchedTheme.id;
                }
            }
        }

        if (!parentTopicName && isSmartTest) {
            displayTopicTitle = "Genel Karışık Soru Modu";
            parentTopicName = "Genel Tekrar";
        }

        let testUrl = '#';
        if (isSmartTest && r.mode) {
            testUrl = `/konu/${topicSlug || 'genel'}/test-coz/serbest-calisma-modu--smart?filter=${encodeURIComponent(r.mode)}&ref=/analiz`;
        } else if (r.examId) {
            const urlSlug = topicSlug || 'genel-deneme';
            const testSlug = normalizeStr(displayTopicTitle).replace(/\W+/g, '-') || r.examId;
            testUrl = `/konu/${urlSlug}/test-coz/${testSlug}--${r.examId}?mode=select&ref=/analiz`;
        }

        return `<tr>
            <td data-label="Test Tarihi" style="width: 100px;">
                 <div class="table-date-pill">${date}</div>
            </td>
            <td data-label="Sınav / Test Adı" class="history-title-cell">
                 <a href="${testUrl}" style="text-decoration:none; display:flex; flex-direction:column; align-items:flex-start;">
                    ${parentTopicName ? `<div class="history-topic-badge"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align:-1px; margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>${parentTopicName}</div>` : `<div class="history-topic-badge"><svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align:-1px; margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>Genel Konu</div>`}
                    <strong class="history-test-title" style="color:var(--text-primary); font-weight:600; font-size: 0.95rem; transition: color 0.2s;" onmouseover="this.style.color='var(--color-primary)'" onmouseout="this.style.color='var(--text-primary)'">${r.examTitle || displayTopicTitle}</strong>
                    ${smartTestBadge}
                </a>
            </td>
            <td data-label="Performans" style="flex: 2;">
               <div class="exam-progress-wrap" style="margin-top: 2px;">
                  <div class="exam-stats-text" style="display: flex; justify-content: space-between; font-size: 0.75rem; margin-bottom: 6px;">
                     <span style="color: var(--text-muted);">Toplam: ${total} Soru</span>
                     <span class="s-net" style="font-weight: 600; color: var(--text-main);">${finalNet} Net</span>
                  </div>
                  <div class="exam-bar-container" style="position: relative; height: 22px; border-radius: 6px; background: rgba(255,255,255,0.05); overflow: hidden;">
                     <div class="exam-bar-correct" style="width: ${correctPct}%; height: 100%; transition: width 0.5s;"></div>
                     <div class="exam-bar-wrong" style="width: ${wrongPct}%; height: 100%; transition: width 0.5s;"></div>
                     
                     <!-- Score Badge inside Progress Bar -->
                     <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 5; pointer-events: none;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.9); letter-spacing: 0.5px;">Başarı: %${score}</span>
                     </div>
                  </div>
                  <div class="exam-stats-text" style="font-size: 0.65rem; margin-top: 6px; display: flex; gap: 12px; opacity: 0.8;">
                     <span class="s-correct" style="color: #34d399;">${correctCount} Doğru</span>
                     <span class="s-wrong" style="color: #f87171;">${wrongCount} Yanlış</span>
                     <span style="color: var(--text-muted);">${total - correctCount - wrongCount} Boş</span>
                  </div>
               </div>
            </td>
        </tr>`;
    }).join('');
}

function calculateConsistencyScore(results) {
    if (results.length < 2) return 0;
    const sorted = [...results].sort((a, b) => getCompletedSeconds(a) - getCompletedSeconds(b));
    const scores = sorted.map(getExamScore);
    const diffs = scores.slice(1).map((value, i) => Math.abs(value - scores[i]));
    const avgDiff = diffs.reduce((sum, d) => sum + d, 0) / diffs.length;
    return Math.max(0, Math.min(100, Math.round(100 - (avgDiff * 2))));
}

function calculateTrend(results) {
    if (results.length < 4) return { delta: 0, label: 'Veri birikiyor' };
    const ordered = [...results].sort((a, b) => getCompletedSeconds(a) - getCompletedSeconds(b));
    const half = Math.floor(ordered.length / 2);
    const firstAvg = ordered.slice(0, half).reduce((sum, exam) => sum + getExamScore(exam), 0) / Math.max(half, 1);
    const secondAvg = ordered.slice(half).reduce((sum, exam) => sum + getExamScore(exam), 0) / Math.max(ordered.length - half, 1);
    const delta = Math.round(secondAvg - firstAvg);
    if (delta >= 4) return { delta, label: 'Yükseliş trendi' };
    if (delta <= -4) return { delta, label: 'Düşüş trendi' };
    return { delta, label: 'Dengeli seyir' };
}

function renderScientificInsights(categoryTotals) {
    const exams = state.results.length;
    const weeklyCount = state.results.filter(exam => {
        const sec = getCompletedSeconds(exam);
        return sec && sec * 1000 >= Date.now() - (7 * 24 * 60 * 60 * 1000);
    }).length;
    const consistency = calculateConsistencyScore(state.results);
    const trend = calculateTrend(state.results);
    const effectiveTopicsIds = new Set(getEffectiveTopics(state.topics).map(t => t.id));
    const weakTopics = [...state.successMap.entries()]
        .map(([topicId, success]) => ({ topicId, success, topic: state.topics.find(t => t.id === topicId) }))
        .filter(row => row.topic && effectiveTopicsIds.has(row.topicId))
        .sort((a, b) => a.success - b.success)
        .slice(0, 3);

    const insightGrid = document.getElementById('insightKpiGrid');
    if (insightGrid) {
        insightGrid.innerHTML = `
        <div class="insight-pill"><span><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align: text-bottom; margin-right: 4px; color: var(--color-info)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>Haftalık Tempo</span><strong>${weeklyCount} deneme</strong></div>
        <div class="insight-pill"><span><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align: text-bottom; margin-right: 4px; color: var(--color-success)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>İstikrar</span><strong>%${consistency}</strong></div>
        <div class="insight-pill"><span><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align: text-bottom; margin-right: 4px; color: var(--color-warning)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>İvme/Trend</span><strong>${trend.delta > 0 ? '+' : ''}${trend.delta} puan</strong></div>
        <div class="insight-pill"><span><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align: text-bottom; margin-right: 4px; color: var(--gold-main)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>Toplam Birikim</span><strong>${exams} deneme</strong></div>
      `;
    }

    const weaknessPlanList = document.getElementById('weaknessPlanList');
    if (!weaknessPlanList) return;

    if (!weakTopics.length) {
        weaknessPlanList.innerHTML = `
        <div style="text-align:center; padding: 20px 10px;">
           <div style="margin-bottom:10px;"><svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--color-success)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg></div>
           <strong style="color:var(--text-main); font-size:1rem;">Zayıf Nokta Tespit Edilmedi</strong>
           <p class="text-muted" style="margin-top:6px; font-size:0.85rem;">Şu an için analiz sistemine takılan kritik bir zayıf konun bulunmuyor. Düzenli olarak branş ve genel deneme çözmeye devam et!</p>
        </div>`;
        return;
    }

    weaknessPlanList.innerHTML = weakTopics.map((item, index) => {
        const total = categoryTotals[item.topicId]?.total || 0;
        const plan = total < 15
            ? '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align: text-bottom; margin-right: 4px; color: var(--color-warning)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg> Veri eksik. Hemen 20 soruluk mini bir tekrar testi çözerek zayıflığını ölç.'
            : '<svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="vertical-align: text-bottom; margin-right: 4px; color: var(--color-primary)"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg> Öncelikli Görev: 2 gün arayla kısa konu tekrarı yap ve 10 soruluk bir konsept pekiştirme testi uygulamadan diğer konuya geçme.';
        return `
          <article class="weakness-item">
            <strong><span class="alert-color">Kritik Tespit ${index + 1}:</span> ${item.topic.title}</strong>
            <div class="text-muted" style="margin-top: 4px; font-size: 0.78rem;">Başarı Durumu: <strong>%${item.success}</strong> · Toplam Analiz Edilen Soru: ${total}</div>
            <p>${plan}</p>
          </article>
        `;
    }).join('');
}



function renderLevelSystem() {
    const totalCorrect = state.results.reduce((sum, exam) => sum + parseNum(exam.correct), 0);
    const { completed: completedTopics, remaining: remainingTopics } = getTopicCompletionSummary();
    const xp = (totalCorrect * 2) + (state.results.length * 20) + (completedTopics * 50);

    const levels = [
        { level: 1, name: 'Çaylak', minXp: 0 },
        { level: 2, name: 'Hırslı', minXp: 500 },
        { level: 3, name: 'Usta', minXp: 1500 },
        { level: 4, name: 'Efsane', minXp: 3000 }
    ];

    const idx = levels.reduce((acc, curr, i) => xp >= curr.minXp ? i : acc, 0);
    const current = levels[idx];
    const next = levels[idx + 1];

    document.getElementById('currentLevel').innerText = `${current.name} (Lv.${current.level})`;
    document.getElementById('currentLevelXp').innerText = `${xp} XP`;
    document.getElementById('currentLevelBadge').innerText = `Seviye ${current.level}`;

    if (next) {
        const range = next.minXp - current.minXp;
        const progress = xp - current.minXp;
        const percent = Math.max(0, Math.min(100, Math.round((progress / range) * 100)));
        document.getElementById('levelProgressBar').style.width = `${percent}%`;
        document.getElementById('levelProgressText').innerText = `${progress} / ${range} XP`;
        document.getElementById('levelNextTarget').innerText = `Sonraki: ${next.name}`;
    } else {
        document.getElementById('levelProgressBar').style.width = '100%';
        document.getElementById('levelProgressText').innerText = 'Maksimum seviye';
        document.getElementById('levelNextTarget').innerText = '-';
    }

    const streakDays = calculateStudyStreak(state.results);
    const missionList = document.getElementById('missionList');
    if (missionList) {
        missionList.innerHTML = `
            <div class="mission-item"><strong><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--color-warning); vertical-align:-2px; margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z"></path></svg>Çalışma Serisi</strong><div class="text-muted">${streakDays} gün kesintisiz</div></div>
            <div class="mission-item"><strong><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="color:var(--gold-main); vertical-align:-2px; margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path></svg>Yetkinlik Seviyesi</strong><div class="text-muted">${xp} Toplam TP</div></div>
        `;
    }

    // combinedTopics KPI update
    const combinedTopicsEl = document.getElementById('combinedTopicsCount');
    if (combinedTopicsEl) combinedTopicsEl.innerText = `${completedTopics} / ${remainingTopics}`;
}

function calculateStudyStreak(results) {
    if (!results.length) return 0;
    const days = new Set(results.map(r => getCompletedSeconds(r)).filter(Boolean).map(sec => new Date(sec * 1000).toISOString().slice(0, 10)));
    return days.size;
}

function bindUIEvents() {
    const resetBtn = document.getElementById('resetAllStatsBtn');
    if (resetBtn) resetBtn.addEventListener('click', resetAllStats);
}



async function resetAllStats() {
    const shouldReset = await showConfirm('Tüm istatistikler sıfırlanacak. Onaylıyor musun?', { title: 'Tüm Verileri Sıfırla', confirmText: 'Evet', cancelText: 'Hayır', tone: 'warning' });
    if (!shouldReset) return;
    await setDoc(doc(db, 'users', state.userId), {
        statsResetAt: serverTimestamp(),
        topicResets: {},
        currentTopicId: null,
        currentTopicUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });

    // Kullanıcının tüm progress objelerini arka planda tek seferde temizle ki sıfırlamadan sonra çözdüğünde tarihsel soru sayıları eklenmesin.
    try {
        const progressSnap = await getDocs(
            query(
                collection(db, `users/${state.userId}/topic_progress`),
                orderBy(documentId()),
                limit(ANALYSIS_PROGRESS_RESET_FETCH_LIMIT)
            ),
            "users.topic_progress"
        );
        const updateTasks = progressSnap.docs.map((d) => () => setDoc(d.ref, {
            status: 'pending',
            manualCompleted: false,
            updatedAt: serverTimestamp(),
            lastSyncedAt: serverTimestamp(),
            solvedCount: 0,
            solvedIds: [],
            answers: {}
        }, { merge: true }));
        await runChunked(updateTasks, ANALYSIS_PROGRESS_RESET_WRITE_CHUNK);
    } catch (err) {
        console.warn("Toplu progress sıfırlama uyarısı:", err);
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    state.statsResetAt = nowSeconds;
    state.topicResets = {};
    state.currentTopicId = null;
    await syncCachedUserProfilePatch(state.userId, {
        statsResetAt: { seconds: nowSeconds },
        topicResets: {},
        currentTopicId: null,
        currentTopicUpdatedAt: { seconds: nowSeconds },
        updatedAt: { seconds: nowSeconds }
    });
    state.progressMap.forEach((data, key) => {
        state.progressMap.set(key, {
            ...data,
            status: 'pending',
            manualCompleted: false,
            updatedAt: { seconds: nowSeconds },
            lastSyncedAt: { seconds: nowSeconds },
            solvedCount: 0,
            solvedIds: [],
            answers: {}
        });
    });
    await CacheManager.saveData(USER_CACHE_KEYS.topicProgressCollection(state.userId), [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderAnalysisState();
}
