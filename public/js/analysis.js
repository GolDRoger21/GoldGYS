import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, documentId, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from "./firestore-metrics.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showConfirm, showToast } from "./notifications.js";
import { TopicService } from "./topic-service.js";
import { buildTopicPath } from "./topic-url.js";
import { CacheManager } from "./cache-manager.js";

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
    topicFilter: 'in_progress',
    search: '',
    sortBy: 'smart',
    charts: { progress: null, topic: null }
};

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        state.userId = user.uid;
        bindUIEvents();
        await initAnalysis(user.uid);
    });
});


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
            const resultsCacheKey = `exam_results_col_${userId}`;
            const cachedResults = await CacheManager.getData(resultsCacheKey, ANALYSIS_CACHE_TTL);
            if (cachedResults?.cached && cachedResults.data) {
                return cachedResults.data;
            } else {
                const resultsQuery = query(collection(db, `users/${userId}/exam_results`), orderBy('completedAt', 'desc'), limit(100));
                const resultSnap = await getDocs(resultsQuery);
                const rawResults = resultSnap.docs.map(d => d.data());
                await CacheManager.saveData(resultsCacheKey, rawResults, ANALYSIS_CACHE_TTL);
                return rawResults;
            }
        };

        const fetchProgress = async () => {
            const progressColCacheKey = `topic_progress_col_${userId}`;
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
            const userCacheKey = `user_profile_${userId}`;
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
    renderTopicList();
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
    const userCacheKey = `user_profile_${userId}`;
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

        if (r.mode === 'wrongs' || displayTopicTitle.toLowerCase().includes('yanlış')) {
            isSmartTest = true;
            smartTestBadge = '<span class="status-badge badge-red" style="padding: 2px 6px; font-size: 0.65rem; margin-top:4px;">🚨 Yanlışlar Testi</span>';
        } else if (r.mode === 'random') {
            isSmartTest = true;
            smartTestBadge = '<span class="status-badge badge-gray" style="padding: 2px 6px; font-size: 0.65rem; margin-top:4px;">🔀 Karışık Tekrar</span>';
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
                    ${parentTopicName ? `<div class="history-topic-badge">📚 ${parentTopicName}</div>` : `<div class="history-topic-badge">📚 Genel Konu</div>`}
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
        <div class="insight-pill"><span>🏃 Haftalık Tempo</span><strong>${weeklyCount} deneme</strong></div>
        <div class="insight-pill"><span>🛡️ İstikrar</span><strong>%${consistency}</strong></div>
        <div class="insight-pill"><span>📈 İvme/Trend</span><strong>${trend.delta > 0 ? '+' : ''}${trend.delta} puan</strong></div>
        <div class="insight-pill"><span>📚 Toplam Birikim</span><strong>${exams} deneme</strong></div>
      `;
    }

    const weaknessPlanList = document.getElementById('weaknessPlanList');
    if (!weaknessPlanList) return;

    if (!weakTopics.length) {
        weaknessPlanList.innerHTML = `
        <div style="text-align:center; padding: 20px 10px;">
           <div style="font-size:2rem; margin-bottom:10px;">🛡️</div>
           <strong style="color:var(--text-main); font-size:1rem;">Zayıf Nokta Tespit Edilmedi</strong>
           <p class="text-muted" style="margin-top:6px; font-size:0.85rem;">Şu an için analiz sistemine takılan kritik bir zayıf konun bulunmuyor. Düzenli olarak branş ve genel deneme çözmeye devam et!</p>
        </div>`;
        return;
    }

    weaknessPlanList.innerHTML = weakTopics.map((item, index) => {
        const total = categoryTotals[item.topicId]?.total || 0;
        const plan = total < 15
            ? '⚡ Veri eksik. Hemen 20 soruluk mini bir tekrar testi çözerek zayıflığını ölç.'
            : '🎯 Öncelikli Görev: 2 gün arayla kısa konu tekrarı yap ve 10 soruluk bir konsept pekiştirme testi uygulamadan diğer konuya geçme.';
        return `
          <article class="weakness-item">
            <strong><span class="alert-color">Kritik Tespit ${index + 1}:</span> ${item.topic.title}</strong>
            <div class="text-muted" style="margin-top: 4px; font-size: 0.78rem;">Başarı Durumu: <strong>%${item.success}</strong> · Toplam Analiz Edilen Soru: ${total}</div>
            <p>${plan}</p>
          </article>
        `;
    }).join('');
}

function sortTopics(rows) {
    if (state.sortBy === 'alphabetical') return rows.sort((a, b) => a.topic.title.localeCompare(b.topic.title, 'tr'));
    if (state.sortBy === 'strongest') return rows.sort((a, b) => b.success - a.success);
    if (state.sortBy === 'weakest') return rows.sort((a, b) => a.success - b.success);

    // state.sortBy === 'smart' varsayılan sıralama stratejisi
    return rows.sort((a, b) => {
        // Eğer Çalışılanlar veya Bitirilenler sekmesindeysek, ilerleme oranına (success) göre en iyi olanı başa koy (soru saysından ziyade)
        if (state.topicFilter === 'in_progress' || state.topicFilter === 'completed') {
            if (b.success !== a.success) return b.success - a.success;
        }

        // Diğer sekmelerde (Başlanmayanlar / Tümü) veya oran aynıysa -> Sınavda çıkacak Soru/Hedef sayısına göre sırala (En çok soru çıkan 1. sıraya)
        const tA = parseNum(a.topic.totalQuestionTarget || a.topic.targetQuestions || a.topic._fetchedTotal);
        const tB = parseNum(b.topic.totalQuestionTarget || b.topic.targetQuestions || b.topic._fetchedTotal);

        if (tB !== tA) return tB - tA;
        return b.success - a.success;
    });
}

function renderTopicList() {
    const container = document.getElementById('topicMasteryList');
    // Sadece etkili konuları (alt konuları olan üst konuları hariç tut) gösteriyoruz:
    const effectiveTopics = getEffectiveTopics(state.topics);

    let rows = effectiveTopics.map(topic => {
        const success = state.successMap.get(topic.id) || 0;
        const status = getTopicStatus(topic.id);
        return { topic, success, status };
    });

    rows = rows.filter(row => state.topicFilter === 'all' || row.status === state.topicFilter);
    if (state.search.trim()) {
        const q = normalizeStr(state.search);
        rows = rows.filter(row => normalizeStr(row.topic.title).includes(q));
    }
    rows = sortTopics(rows);

    if (!rows.length) {
        container.innerHTML = '<tr><td colspan="4" class="text-center">Filtreye uygun konu bulunamadı.</td></tr>';
        return;
    }

    container.innerHTML = rows.map(({ topic, success, status }) => {
        const badgeData = getBadgeHTMLForStatus(status);
        const focusEmoji = topic.id === state.currentTopicId ? '🎯' : '⭕';
        const isCurrentRow = topic.id === state.currentTopicId ? 'active-focus-row' : '';
        const topicUrl = buildTopicPath ? buildTopicPath(topic) : `/konu/${topic.slug || topic.id}`;

        return `<tr class="topic-row ${isCurrentRow}" data-status="${status}">
            <td data-label="Konu">
                <a href="${topicUrl}" class="topic-title-main" style="text-decoration:none; display:flex; align-items:center; gap:8px;">
                    <span style="color:var(--text-main); transition:color 0.2s;" onmouseover="this.style.color='var(--color-primary)'" onmouseout="this.style.color='var(--text-main)'">${topic.title}</span>
                </a>
                <div class="topic-desc-sub" style="margin-top:4px;">${topic.description || ''}</div>
            </td>
            <td data-label="Başarı">
                <div class="progress-container">
                    <div class="progress-bar-wrap">
                        <div class="progress-bar-fill" style="width:${success}%; background: ${getProgressColor(success)};"></div>
                    </div>
                    <span class="progress-val" style="color: ${getProgressColor(success)};">%${success}</span>
                </div>
            </td>
            <td data-label="Durum">
                <div class="topic-status-cell">
                    ${badgeData}
                    ${topic.id === state.currentTopicId ? '<span class="focus-indicator">Odak</span>' : ''}
                </div>
            </td>
            <td data-label="İşlemler">
              <div class="action-buttons">
                <button class="glass-btn btn-complete" onclick="window.toggleTopicStatus('${topic.id}', 'completed')" title="Öğrendim / Çalıştım">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                </button>
                <button class="glass-btn btn-focus ${topic.id === state.currentTopicId ? 'is-focused' : ''}" onclick="window.setFocusTopic('${topic.id}')" title="Bu konuya odaklan">
                    ${focusEmoji}
                </button>
                <button class="glass-btn btn-reset" onclick="window.resetTopicStats('${topic.id}')" title="İstatistikleri ve ilerlemeyi tamemen sıfırla">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                </button>
              </div>
            </td>
        </tr>`;
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
            <div class="mission-item"><strong>🔥 Çalışma Serisi</strong><div class="text-muted">${streakDays} gün kesintisiz</div></div>
            <div class="mission-item"><strong>🏆 Yetkinlik Seviyesi</strong><div class="text-muted">${xp} Toplam TP</div></div>
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
    document.getElementById('resetAllStatsBtn').addEventListener('click', resetAllStats);
    const chips = document.querySelectorAll('#topicFilterChips button');
    const filterDesc = document.getElementById('filterDescription');
    const filterTexts = {
        'in_progress': 'Şu an çalışmaya devam ettiğiniz veya odaklandığınız konular',
        'pending': 'Henüz çalışmaya veya test çözmeye başlamadığınız konular',
        'completed': 'Başarıyla tamamladığınız veya testlerini bitirdiğiniz konular',
        'all': 'Müfredattaki tüm konuların listesi'
    };

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            state.topicFilter = chip.dataset.filter;
            chips.forEach(c => {
                c.classList.remove('badge-blue', 'is-active');
                c.classList.add('badge-gray');
            });
            chip.classList.remove('badge-gray');
            chip.classList.add('badge-blue', 'is-active');

            if (filterDesc) {
                if (window.innerWidth <= 768) {
                    filterDesc.style.display = 'block';
                    filterDesc.innerText = filterTexts[state.topicFilter] || '';
                } else {
                    filterDesc.style.display = 'none';
                }
            }

            renderTopicList();
        });
    });

    // Initial setup for the description if a default filter is active on mobile
    const activeChip = Array.from(chips).find(c => c.dataset.filter === state.topicFilter) || Array.from(chips).find(c => c.classList.contains('badge-blue'));
    if (activeChip) {
        chips.forEach(c => c.classList.remove('is-active'));
        activeChip.classList.add('is-active');
    }

    if (filterDesc && window.innerWidth <= 768 && activeChip) {
        filterDesc.style.display = 'block';
        filterDesc.innerText = filterTexts[activeChip.dataset.filter] || '';
    }
    document.getElementById('topicSearchInput').addEventListener('input', (e) => {
        state.search = e.target.value;
        renderTopicList();
    });
    document.getElementById('topicSortSelect').addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        renderTopicList();
    });
}

window.toggleTopicStatus = async (topicId, newStatus) => {
    const shouldUpdate = await showConfirm('Konu durumunu güncellemek istiyor musun?', { title: 'Durum Güncelle', confirmText: 'Güncelle', cancelText: 'Vazgeç', tone: 'warning' });
    if (!shouldUpdate) return;
    await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), { status: newStatus, manualCompleted: true, updatedAt: serverTimestamp() }, { merge: true });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const current = state.progressMap.get(topicId) || {};
    state.progressMap.set(topicId, { ...current, status: newStatus, manualCompleted: true, updatedAt: { seconds: nowSeconds } });
    await CacheManager.saveData(`topic_progress_col_${state.userId}`, [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderAnalysisState();
};

window.setFocusTopic = async (topicId) => {
    const isCurrent = state.currentTopicId === topicId;
    await setDoc(doc(db, 'users', state.userId), {
        currentTopicId: isCurrent ? null : topicId,
        currentTopicUpdatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
    if (!isCurrent) {
        await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), { status: 'in_progress', updatedAt: serverTimestamp() }, { merge: true });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    state.currentTopicId = isCurrent ? null : topicId;
    await syncCachedUserProfilePatch(state.userId, {
        currentTopicId: state.currentTopicId,
        currentTopicUpdatedAt: { seconds: nowSeconds },
        updatedAt: { seconds: nowSeconds }
    });
    if (!isCurrent) {
        const current = state.progressMap.get(topicId) || {};
        state.progressMap.set(topicId, { ...current, status: 'in_progress', updatedAt: { seconds: nowSeconds } });
    }
    await CacheManager.saveData(`topic_progress_col_${state.userId}`, [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderAnalysisState();
};

window.resetTopicStats = async (topicId) => {
    const shouldReset = await showConfirm('Bu konuya ait istatistikleri sıfırlamak istediğine emin misin?', { title: 'Konu İstatistiğini Sıfırla', confirmText: 'Sıfırla', cancelText: 'Vazgeç', tone: 'warning' });
    if (!shouldReset) return;

    const updates = {
        [`topicResets.${topicId}`]: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    if (state.currentTopicId === topicId) {
        updates.currentTopicId = null;
        updates.currentTopicUpdatedAt = serverTimestamp();
    }

    await setDoc(doc(db, 'users', state.userId), updates, { merge: true });

    // Güvenliği garantiye almak ve %100 sıfırlama için topic_progress bilgilerini siliyoruz.
    await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), {
        status: 'pending',
        manualCompleted: false,
        updatedAt: serverTimestamp(),
        lastSyncedAt: serverTimestamp(),
        solvedCount: 0,
        solvedIds: [],
        answers: {}
    }, { merge: true });

    const nowSeconds = Math.floor(Date.now() / 1000);
    state.topicResets[topicId] = nowSeconds;
    if (state.currentTopicId === topicId) state.currentTopicId = null;
    await syncCachedUserProfilePatch(state.userId, {
        topicResets: { ...(state.topicResets || {}) },
        currentTopicId: state.currentTopicId,
        currentTopicUpdatedAt: { seconds: nowSeconds },
        updatedAt: { seconds: nowSeconds }
    });
    const current = state.progressMap.get(topicId) || {};
    state.progressMap.set(topicId, {
        ...current,
        status: 'pending',
        manualCompleted: false,
        updatedAt: { seconds: nowSeconds },
        lastSyncedAt: { seconds: nowSeconds },
        solvedCount: 0,
        solvedIds: [],
        answers: {}
    });
    await CacheManager.saveData(`topic_progress_col_${state.userId}`, [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderAnalysisState();
};

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
    await CacheManager.saveData(`topic_progress_col_${state.userId}`, [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), ANALYSIS_CACHE_TTL);
    renderAnalysisState();
}
