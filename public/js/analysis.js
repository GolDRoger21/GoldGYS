import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showConfirm, showToast } from "./notifications.js";

const state = {
    userId: null,
    results: [],
    topics: [],
    progressMap: new Map(),
    successMap: new Map(),
    currentTopicId: null,
    statsResetAt: null,
    topicResets: {},
    topicFilter: 'all',
    search: '',
    sortBy: 'weakest',
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
        const resultsQuery = query(collection(db, `users/${userId}/exam_results`), orderBy('completedAt', 'desc'), limit(100));
        const [resultSnap, userSnap, topicsSnap, progressSnap] = await Promise.all([
            getDocs(resultsQuery),
            getDoc(doc(db, "users", userId)),
            getDocs(query(collection(db, "topics"), orderBy("order", "asc"))),
            getDocs(collection(db, `users/${userId}/topic_progress`))
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

        const rawResults = resultSnap.docs.map(d => d.data());
        state.results = applyGlobalReset(rawResults, state.statsResetAt);
        state.topics = topicsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
            .filter(t => t.isActive !== false && t.status !== 'deleted' && t.isDeleted !== true);
        state.progressMap = new Map(progressSnap.docs.map(d => [d.id, d.data()]));

        const categoryTotals = buildCategoryTotals(state.results, state.topics, state.topicResets);
        state.successMap = buildTopicSuccessMap(state.topics, categoryTotals);

        calculateKPIs(state.results);
        calculatePredictedScore(state.results);
        renderProgressChart(state.results);
        renderTopicChart(categoryTotals);
        renderHistoryTable(state.results);
        renderTopicList();
        renderLevelSystem();
        setLastUpdateState();
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

    const consistencyIssues = results.reduce((acc, exam) => {
        const total = getExamTotal(exam);
        const correct = parseNum(exam.correct);
        const wrong = parseNum(exam.wrong);
        if (correct + wrong > total) return acc + 1;
        const score = parseNum(exam.score);
        if (score < 0 || score > 100) return acc + 1;
        return acc;
    }, 0);

    const dataQuality = totalExams ? Math.max(0, Math.round(((totalExams - consistencyIssues) / totalExams) * 100)) : 100;

    document.getElementById('totalExams').innerText = totalExams;
    document.getElementById('avgScore').innerText = `%${avgScore}`;
    // Çözülen soru yerine "Net Sayısı" veya "Net / Soru" görünümü daha şık olabilir ama şimdilik tasarımı bozmayalım
    document.getElementById('totalQuestions').innerText = totalQuestions;
    document.getElementById('wrongRate').innerText = `%${wrongRate}`;
    document.getElementById('last7DaysCount').innerText = last7DaysCount;
    document.getElementById('dataQuality').innerText = `%${dataQuality}`;
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
    // Tüm görünmez karakterleri, \u200B (zero-width space) vb. karakterleri ve baş/son boşlukları sil+
    // Ayrıca case-insensitive olması için toLocaleLowerCase kullan.
    return str.toString()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
        .toLocaleLowerCase('tr-TR');
}

function buildCategoryTotals(results, topics, topicResets) {
    const categoryTotals = {};
    const titleToTopic = new Map(topics.map(topic => [normalizeStr(topic.title), topic]));
    topics.forEach(topic => { categoryTotals[topic.title] = { correct: 0, total: 0 }; });

    results.forEach(exam => {
        if (!exam.categoryStats) return;
        const completedAt = getCompletedSeconds(exam);
        Object.entries(exam.categoryStats).forEach(([cat, stats]) => {
            const topic = titleToTopic.get(normalizeStr(cat));
            if (!topic) return;
            const resetAt = topicResets?.[topic.id];
            if (resetAt && completedAt && completedAt <= resetAt) return;
            categoryTotals[topic.title].correct += parseNum(stats.correct);
            categoryTotals[topic.title].total += parseNum(stats.total);
        });
    });
    return categoryTotals;
}

function buildTopicSuccessMap(topics, categoryTotals) {
    const map = new Map();
    topics.forEach(topic => {
        const stats = categoryTotals[topic.title];
        const value = stats && stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
        map.set(topic.id, value);
    });
    return map;
}

function getTopicStatus(topicId) {
    const progress = state.progressMap.get(topicId);
    const progressUpdatedAt = normalizeResetTimestamp(progress?.updatedAt);
    if (state.statsResetAt && progressUpdatedAt && progressUpdatedAt <= state.statsResetAt) return 'pending';
    const topicResetAt = state.topicResets?.[topicId];
    if (topicResetAt && progressUpdatedAt && progressUpdatedAt <= topicResetAt) return 'pending';
    if (progress?.status === 'completed') return 'completed';
    // Eğer konu focus olarak seçildiyse doğrudan in_progress kabul et
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
            <td><div class="table-date-pill">${date}</div></td>
            <td><strong style="color:var(--text-primary); font-weight:500;">${r.examTitle || 'Genel Test'}</strong></td>
            <td>
               <span style="color:var(--color-success)">${parseNum(r.correct)}D</span>
               <span style="color:var(--color-danger); margin-left:4px;">${parseNum(r.wrong)}Y</span>
               <span style="color:var(--text-muted); margin-left:8px; font-weight:600;">${finalNet} Net</span>
            </td>
            <td><div class="score-badge">%${parseNum(r.score)}</div></td>
        </tr>`;
    }).join('');
}

function sortTopics(rows) {
    if (state.sortBy === 'alphabetical') return rows.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    if (state.sortBy === 'strongest') return rows.sort((a, b) => b.success - a.success);
    return rows.sort((a, b) => a.success - b.success);
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

        return `<tr class="topic-row ${isCurrentRow}" data-status="${status}">
            <td>
                <div class="topic-title-main">
                    ${topic.title}
                    ${topic.id === state.currentTopicId ? '<span class="focus-indicator">🌟 Odak</span>' : ''}
                </div>
                <div class="topic-desc-sub">${topic.description || 'Açıklama veya ek bilgi yok.'}</div>
            </td>
            <td>
                <div class="progress-container">
                    <div class="progress-bar-wrap">
                        <div class="progress-bar-fill" style="width:${success}%; background: ${getProgressColor(success)};"></div>
                    </div>
                    <span class="progress-val" style="color: ${getProgressColor(success)};">%${success}</span>
                </div>
            </td>
            <td>${badgeData}</td>
            <td>
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
        <div class="mission-item"><strong>📚 Tamamlanan Konu</strong><div class="text-muted">${completedTopics} konu tamamlandı</div></div>
    `;
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
            chips.forEach(c => { c.classList.remove('status-in-progress'); c.classList.add('status-pending'); });
            chip.classList.remove('status-pending');
            chip.classList.add('status-in-progress');
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
    await initAnalysis(state.userId);
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
    await initAnalysis(state.userId);
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
    await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), { status: 'pending', manualCompleted: false, updatedAt: serverTimestamp() }, { merge: true });
    await initAnalysis(state.userId);
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
    await initAnalysis(state.userId);
}
