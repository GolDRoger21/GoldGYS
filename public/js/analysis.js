import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showConfirm, showToast } from "./notifications.js";
import { TopicService } from "./topic-service.js";
import { buildTopicPath } from "./topic-url.js";
import { CacheManager } from "./cache-manager.js";

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
        // --- CACHE: TOPICS (24 Saat) ---
        let allTopics = [];
        const cachedTopics = await CacheManager.getData('all_topics', 24 * 60 * 60 * 1000);
        if (cachedTopics?.cached && cachedTopics.data) {
            allTopics = cachedTopics.data;
            console.log("[Cache] Konular IndexedDB'den yüklendi (/analiz)");
        } else {
            const topicsSnap = await getDocs(query(collection(db, "topics"), orderBy("order", "asc")));
            allTopics = topicsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.isActive !== false && t.status !== 'deleted' && t.isDeleted !== true);
            await CacheManager.saveData('all_topics', allTopics, 24 * 60 * 60 * 1000);
            console.log("[Network] Konular Firestore'dan çekildi ve önbelleğe alındı.");
        }

        // --- CACHE: EXAM RESULTS (5 Dakika) ---
        const resultsCacheKey = `exam_results_col_${userId}`;
        let rawResults = [];
        const cachedResults = await CacheManager.getData(resultsCacheKey, 5 * 60 * 1000);
        if (cachedResults?.cached && cachedResults.data) {
            rawResults = cachedResults.data;
        } else {
            const resultsQuery = query(collection(db, `users/${userId}/exam_results`), orderBy('completedAt', 'desc'), limit(100));
            const resultSnap = await getDocs(resultsQuery);
            rawResults = resultSnap.docs.map(d => d.data());
            await CacheManager.saveData(resultsCacheKey, rawResults, 5 * 60 * 1000);
        }

        // --- CACHE: TOPIC PROGRESS (5 Dakika) ---
        const progressColCacheKey = `topic_progress_col_${userId}`;
        let progressMapDocs = [];
        const cachedProgCol = await CacheManager.getData(progressColCacheKey, 5 * 60 * 1000);
        if (cachedProgCol?.cached && cachedProgCol.data) {
            progressMapDocs = cachedProgCol.data;
        } else {
            const progressSnap = await getDocs(collection(db, `users/${userId}/topic_progress`));
            progressMapDocs = progressSnap.docs.map(d => ({ id: d.id, data: d.data() }));
            await CacheManager.saveData(progressColCacheKey, progressMapDocs, 5 * 60 * 1000);
        }

        // User Meta Dökümanı (Sadece 1 read olduğu için canlı kalabilir veya SWR eklenebilir. Şimdilik canlı)
        const userSnap = await getDoc(doc(db, "users", userId));

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

        // Tüm konu başlıkları için güncel soru sayısını (metadata) veritabanından/cache'den çek
        await Promise.all(state.topics.map(async (t) => {
            try {
                const meta = await TopicService.getTopicPackMeta(t.id);
                if (meta) {
                    t._fetchedTotal = meta.questionCount || (meta.questionIds ? meta.questionIds.length : 0);
                } else {
                    // Fallback using CacheManager to prevent heavy `getTopicQuestionIdsById` reads directly
                    const allIdsCacheKey = `topic_q_ids_${t.id}`;
                    const cachedIds = await CacheManager.getData(allIdsCacheKey, 24 * 60 * 60 * 1000);
                    if (cachedIds?.cached && cachedIds.data) {
                        t._fetchedTotal = cachedIds.data.length;
                    } else {
                        const allIds = await TopicService.getTopicQuestionIdsById(t.id);
                        t._fetchedTotal = allIds.length;
                        await CacheManager.saveData(allIdsCacheKey, allIds, 24 * 60 * 60 * 1000);
                    }
                }
            } catch (err) {
                console.warn("Topic meta fetch error:", err);
            }
        }));

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
    setLastUpdateState();
}

function calculateKPIs(results) {
    const totalExams = results.length;

    // Gerçek sınav verilerinden puanları çek
    const totalScore = results.reduce((sum, exam) => sum + parseNum(exam.score), 0);
    const avgScore = totalExams ? Math.round(totalScore / totalExams) : 0;

    const totalQuestions = results.reduce((sum, exam) => sum + getExamTotal(exam), 0);
    const totalCorrect = results.reduce((sum, exam) => sum + parseNum(exam.correct), 0);
    const totalWrong = results.reduce((sum, exam) => sum + parseNum(exam.wrong), 0);

    // NET hesabı: Her 4 yanlış 1 doğruyu götürür mantığı (Öğrenci dostu veya kurum politikası. Standart: D - Y/4)
    // Eğer kurumda "Net" mantığı yoksa ve sadece salt doğru isteniyorsa "totalCorrect" kullanılır.
    // GYS sınavlarında genelde 4 yanlış mantığı yoktur, o yüzden standart salt "Net Değer" olarak doğru sayısını veya gelişmiş mantığı kullanalım:
    // GoldGYS standardı: Yanlışlar doğruyu götürmez varsayımı daha motive edicidir, ancak doğrusu:
    // Biz saf doğru ve yanlış oranı üzerinden Net çıkartalım:
    const netCount = Math.max(0, totalCorrect - (totalWrong * 0.25)); // 4 yanlış 1 doğru örneği, isteğe göre kapanabilir.

    // Hata Oranı
    const wrongRate = totalQuestions ? Math.round((totalWrong / totalQuestions) * 100) : 0;

    const now = Date.now();
    const sevenDayAgo = now - (7 * 24 * 60 * 60 * 1000);
    const last7DaysCount = results.filter(exam => {
        const sec = getCompletedSeconds(exam);
        return sec && sec * 1000 >= sevenDayAgo;
    }).length;

    document.getElementById('totalExams').innerText = totalExams;
    document.getElementById('avgScore').innerText = `%${avgScore}`;
    document.getElementById('totalQuestions').innerText = totalQuestions;
    document.getElementById('wrongRate').innerText = `%${wrongRate}`;
    document.getElementById('last7DaysCount').innerText = last7DaysCount;
    // dataQuality was removed, 'completedTopicsCount' is managed in renderLevelSystem.
}

function calculatePredictedScore(results) {
    const recent = results.slice(0, 5).reverse();
    if (!recent.length) {
        document.getElementById('predictedScore').innerText = '--';
        return;
    }
    let weightedSum = 0;
    let totalWeight = 0;
    recent.forEach((exam, index) => {
        const weight = index + 1;
        weightedSum += parseNum(exam.score) * weight;
        totalWeight += weight;
    });
    document.getElementById('predictedScore').innerText = `%${Math.round(weightedSum / totalWeight)}`;
}

function ensureChartDestroy(chartKey) {
    if (state.charts[chartKey]) state.charts[chartKey].destroy();
}

function renderProgressChart(results) {
    ensureChartDestroy('progress');
    const chartData = [...results].slice(0, 12).reverse();
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
    const rows = state.topics.map(topic => ({ title: topic.title, success: state.successMap.get(topic.id) || 0 }));
    const weakest = rows.sort((a, b) => a.success - b.success).slice(0, 8);
    const labels = weakest.length ? weakest.map(r => r.title) : ['Veri Yok'];
    const data = weakest.length ? weakest.map(r => r.success) : [0];

    state.charts.topic = new Chart(document.getElementById('topicChart').getContext('2d'), {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Başarı', data, backgroundColor: 'rgba(16,185,129,.6)', borderRadius: 6 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } }
    });
}

function renderHistoryTable(results) {
    const body = document.getElementById('historyTableBody');
    if (!results.length) {
        body.innerHTML = '<tr><td colspan="4" class="text-center" style="padding: 24px; color: var(--text-muted);">Henüz sınav verisi bulunmuyor. İlk denemeni çöz!</td></tr>';
        return;
    }
    body.innerHTML = results.slice(0, 12).map(r => {
        const completed = getCompletedSeconds(r);
        const date = completed ? new Date(completed * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '-';
        const net = parseNum(r.correct) - (parseNum(r.wrong) * 0.25);
        const finalNet = net % 1 === 0 ? net : net.toFixed(2);

        return `<tr>
            <td data-label="Test Tarihi"><div class="table-date-pill">${date}</div></td>
            <td data-label="Sınav / Test Adı"><strong style="color:var(--text-primary); font-weight:500;">${r.examTitle || 'Genel Test'}</strong></td>
            <td data-label="Performans">
               <span style="color:var(--color-success)">${parseNum(r.correct)}D</span>
               <span style="color:var(--color-danger); margin-left:4px;">${parseNum(r.wrong)}Y</span>
               <span style="color:var(--text-muted); margin-left:8px; font-weight:600;">${finalNet} Net</span>
            </td>
            <td data-label="Başarı"><div class="score-badge">%${parseNum(r.score)}</div></td>
        </tr>`;
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
    let rows = state.topics.map(topic => {
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
                    ${topic.id === state.currentTopicId ? '<span class="focus-indicator">🌟 Odak</span>' : ''}
                </a>
                <div class="topic-desc-sub">${topic.description || 'Açıklama veya ek bilgi yok.'}</div>
            </td>
            <td data-label="Başarı">
                <div class="progress-container">
                    <div class="progress-bar-wrap">
                        <div class="progress-bar-fill" style="width:${success}%; background: ${getProgressColor(success)};"></div>
                    </div>
                    <span class="progress-val" style="color: ${getProgressColor(success)};">%${success}</span>
                </div>
            </td>
            <td data-label="Durum">${badgeData}</td>
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
    const completedTopics = state.topics.filter(topic => getTopicStatus(topic.id) === 'completed').length;
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
    document.getElementById('missionList').innerHTML = `
        <div class="mission-item"><strong>🔥 Çalışma Serisi</strong><div class="text-muted">${streakDays} gün kesintisiz</div></div>
        <div class="mission-item"><strong>🏆 Yetkinlik Seviyesi</strong><div class="text-muted">${xp} Toplam TP</div></div>
    `;

    // completedTopics KPI update
    const completedTopicsEl = document.getElementById('completedTopicsCount');
    if (completedTopicsEl) completedTopicsEl.innerText = completedTopics;
}

function calculateStudyStreak(results) {
    if (!results.length) return 0;
    const days = new Set(results.map(r => getCompletedSeconds(r)).filter(Boolean).map(sec => new Date(sec * 1000).toISOString().slice(0, 10)));
    return days.size;
}

function bindUIEvents() {
    document.getElementById('resetAllStatsBtn').addEventListener('click', resetAllStats);
    const chips = document.querySelectorAll('#topicFilterChips button');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            state.topicFilter = chip.dataset.filter;
            chips.forEach(c => {
                c.classList.remove('badge-blue');
                c.classList.add('badge-gray');
            });
            chip.classList.remove('badge-gray');
            chip.classList.add('badge-blue');
            renderTopicList();
        });
    });
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
    await CacheManager.saveData(`topic_progress_col_${state.userId}`, [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), 5 * 60 * 1000);
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
    if (!isCurrent) {
        const current = state.progressMap.get(topicId) || {};
        state.progressMap.set(topicId, { ...current, status: 'in_progress', updatedAt: { seconds: nowSeconds } });
    }
    await CacheManager.saveData(`topic_progress_col_${state.userId}`, [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), 5 * 60 * 1000);
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
    await CacheManager.saveData(`topic_progress_col_${state.userId}`, [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), 5 * 60 * 1000);
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
        const progressSnap = await getDocs(collection(db, `users/${state.userId}/topic_progress`));
        const batchUpdates = progressSnap.docs.map(d =>
            setDoc(d.ref, {
                status: 'pending',
                manualCompleted: false,
                updatedAt: serverTimestamp(),
                lastSyncedAt: serverTimestamp(),
                solvedCount: 0,
                solvedIds: [],
                answers: {}
            }, { merge: true })
        );
        await Promise.all(batchUpdates);
    } catch (err) {
        console.warn("Toplu progress sıfırlama uyarısı:", err);
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    state.statsResetAt = nowSeconds;
    state.topicResets = {};
    state.currentTopicId = null;
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
    await CacheManager.saveData(`topic_progress_col_${state.userId}`, [...state.progressMap.entries()].map(([id, data]) => ({ id, data })), 5 * 60 * 1000);
    renderAnalysisState();
}
