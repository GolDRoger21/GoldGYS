import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showConfirm, showToast } from "./notifications.js";

const INITIAL_STATE = {
    userId: null,
    results: [],
    currentTopicId: null,
    statsResetAt: null,
    topicResets: {},
    isMounted: true // YENİ: Sayfa açık mı kontrolü
};

let state = { ...INITIAL_STATE };
let unsubscribeAuth = null;
let chartJsPromise = null;

async function ensureChartJs() {
    if (window.Chart) return;
    if (!chartJsPromise) {
        chartJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Chart.js yüklenemedi'));
            document.head.appendChild(script);
        });
    }
    await chartJsPromise;
}


export async function mount() {
    // Reset state
    state = { ...INITIAL_STATE, isMounted: true };

    if (unsubscribeAuth) unsubscribeAuth();

    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (!state.isMounted) return; // Guard
        if (user) {
            state.userId = user.uid;
            await initAnalysis(user.uid);
        } else {
            // ui-loader checks auth, but double check
            window.location.href = '/login.html';
        }
    });
}

export function unmount() {
    state.isMounted = false; // YENİ: Sayfa kapandı işaretle

    if (unsubscribeAuth) {
        unsubscribeAuth();
        unsubscribeAuth = null;
    }
    // Chart instance temizliği
    const chartInstance = Chart.getChart("progressChart");
    if (chartInstance) chartInstance.destroy();

    const topicChartInstance = Chart.getChart("topicChart");
    if (topicChartInstance) topicChartInstance.destroy();

    state = { ...INITIAL_STATE, isMounted: false };
}


async function initAnalysis(userId) {
    try {
        if (!state.isMounted) return;

        await ensureChartJs();
        const resultsRef = collection(db, `users/${userId}/exam_results`);
        // Son 100 sınavı çekip client-side filtreleyebiliriz veya 20 yeterli
        const q = query(resultsRef, orderBy('completedAt', 'desc'), limit(50));
        const [snapshot, userSnap] = await Promise.all([
            getDocs(q),
            getDoc(doc(db, "users", userId))
        ]);

        if (!state.isMounted) return; // Async işlem dönüşü kontrolü

        const results = snapshot.docs.map(doc => doc.data());
        const userData = userSnap.exists() ? userSnap.data() : {};

        state.statsResetAt = normalizeResetTimestamp(userData.statsResetAt);
        state.topicResets = normalizeTopicResets(userData.topicResets);
        state.currentTopicId = resolveCurrentTopicId(
            userData.currentTopicId,
            normalizeResetTimestamp(userData.currentTopicUpdatedAt),
            state.statsResetAt,
            state.topicResets
        );

        const filteredResults = applyGlobalReset(results, state.statsResetAt);
        state.results = filteredResults;

        if (!state.isMounted) return;

        calculateKPIs(filteredResults);
        renderProgressChart(filteredResults);
        renderHistoryTable(filteredResults);
        calculatePredictedScore(filteredResults);

        // Topic loading
        await loadTopicProgress(userId, filteredResults);

        if (!state.isMounted) return;

        renderLevelSystem(userId, filteredResults, state.topicResets, state.statsResetAt);
        bindResetButtons();

        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.innerText = `Son Güncelleme: ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
            lastUpdateEl.classList.remove('status-in-progress');
            lastUpdateEl.classList.add('status-completed');
        }
    } catch (error) {
        if (!state.isMounted) return;
        console.error("Analiz hatası:", error);
        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.innerText = "Hata oluştu";
            lastUpdateEl.classList.add('status-pending');
        }
    }
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
        const completedAt = result.completedAt?.seconds;
        if (!completedAt) return true;
        return completedAt > resetAtSeconds;
    });
}
function calculateKPIs(results) {
    if (!state.isMounted) return;
    const totalExams = results.length;
    const totalScore = results.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const avgScore = totalExams > 0 ? Math.round(totalScore / totalExams) : 0;

    const totalQuestions = results.reduce((acc, curr) => {
        // Eğer veritabanında 'total' alanı yoksa hesapla
        const examTotal = curr.total || ((curr.correct || 0) + (curr.wrong || 0) + (curr.empty || 0));
        return acc + examTotal;
    }, 0);

    const totalWrong = results.reduce((acc, curr) => acc + (curr.wrong || 0), 0);
    const wrongRate = totalQuestions > 0 ? Math.round((totalWrong / totalQuestions) * 100) : 0;

    const elTotalExams = document.getElementById('totalExams');
    if (elTotalExams) elTotalExams.innerText = totalExams;

    const elAvgScore = document.getElementById('avgScore');
    if (elAvgScore) elAvgScore.innerText = `%${avgScore}`;

    const elTotalQuestions = document.getElementById('totalQuestions');
    if (elTotalQuestions) elTotalQuestions.innerText = totalQuestions;

    const elWrongRate = document.getElementById('wrongRate');
    if (elWrongRate) elWrongRate.innerText = `%${wrongRate}`;
}

function renderProgressChart(results) {
    if (!state.isMounted) return;
    // Son 10 sınav
    const chartData = [...results].slice(0, 10).reverse();
    const canvas = document.getElementById('progressChart');
    if (!canvas) return; // Guard clause

    const ctx = canvas.getContext('2d');

    const labels = chartData.length
        ? chartData.map(r => new Date(r.completedAt.seconds * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }))
        : ['Veri Yok'];
    const data = chartData.length ? chartData.map(r => r.score) : [0];

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Sınav Puanı',
                data,
                borderColor: '#D4AF37', // Gold
                backgroundColor: (context) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                    gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
                    gradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)');
                    return gradient;
                },
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#0F172A',
                pointBorderColor: '#D4AF37',
                pointRadius: 6,
                pointHoverRadius: 8,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#D4AF37',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    titleFont: { size: 13 },
                    bodyFont: { size: 14, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 11 } }
                }
            }
        }
    });
}

function renderTopicChart(categoryTotals) {
    if (!state.isMounted) return;
    const canvas = document.getElementById('topicChart');
    if (!canvas) return;

    // En düşük 5 konuyu gösterelim (Zayıflık Analizi)
    // Ya da hepsini gösterip radar ile genel durumu verelim.
    const labels = Object.keys(categoryTotals);
    const data = labels.map(cat => {
        const t = categoryTotals[cat];
        return t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
    });

    const ctx = canvas.getContext('2d');

    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels.length > 0 ? labels : ['Veri Yok'],
            datasets: [{
                label: 'Başarı (%)',
                data: data.length > 0 ? data : [0],
                backgroundColor: 'rgba(16, 185, 129, 0.2)', // Green Soft
                borderColor: '#10b981',
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#10b981',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#10b981',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    angleLines: { color: 'rgba(255, 255, 255, 0.05)' },
                    pointLabels: {
                        color: '#94a3b8',
                        font: { size: 11 }
                    },
                    ticks: { display: false } // Scale numaralarını gizle
                }
            }
        }
    });
}

function renderHistoryTable(results) {
    if (!state.isMounted) return;
    const container = document.getElementById('historyListContainer');
    if (!container) return;

    if (!results.length) {
        container.innerHTML = '<div style="text-align:center; padding: 20px; color: var(--text-muted);">Henüz sınav verisi yok.</div>';
        return;
    }

    // Sadece son 5
    const displayResults = results.slice(0, 5);

    container.innerHTML = displayResults.map(r => {
        const dateObj = new Date(r.completedAt.seconds * 1000);
        const day = dateObj.getDate();
        const month = dateObj.toLocaleDateString('tr-TR', { month: 'short' });
        const examId = r.id || '#'; // Exam ID'si varsa link için kullan

        return `
        <div class="exam-card-item" onclick="window.location.href='/pages/sonuc.html?id=${examId}'">
            <div class="exam-date-box">
                <span class="exam-date-day">${day}</span>
                <span>${month}</span>
            </div>
            <div class="exam-info">
                <div class="exam-title">${r.examTitle || 'Genel Test'}</div>
                <div class="exam-meta">
                    <span style="color:var(--color-success)">${r.correct} D</span> • 
                    <span style="color:var(--color-danger)">${r.wrong} Y</span> • 
                    <span style="color:var(--text-muted)">${r.empty} B</span>
                </div>
            </div>
            <div class="exam-score-box">
                %${r.score}
            </div>
            <div style="text-align:right;">
                <button class="action-btn">➔</button>
            </div>
        </div>
        `;
    }).join('');
}

function buildCategoryTotals(results, topics, topicResets) {
    const categoryTotals = {};
    const titleToId = new Map(topics.map(topic => [topic.title, topic.id]));
    results.forEach(exam => {
        if (!exam.categoryStats) return;
        const completedAt = exam.completedAt?.seconds;
        Object.entries(exam.categoryStats).forEach(([cat, stats]) => {
            const topicId = titleToId.get(cat);
            const resetAt = topicId ? topicResets?.[topicId] : null;
            if (resetAt && completedAt && completedAt <= resetAt) return;
            if (!categoryTotals[cat]) categoryTotals[cat] = { correct: 0, total: 0 };
            categoryTotals[cat].correct += stats.correct || 0;
            categoryTotals[cat].total += stats.total || 0;
        });
    });
    return categoryTotals;
}

function calculatePredictedScore(results) {
    if (!state.isMounted) return;
    const el = document.getElementById('predictedScore');
    if (!el) return;

    // Weighted average
    const recentExams = results.slice(0, 5).reverse();
    if (recentExams.length === 0) {
        el.innerText = '-';
        return;
    }

    let totalWeight = 0;
    let weightedSum = 0;

    recentExams.forEach((exam, index) => {
        const weight = index + 1;
        weightedSum += (exam.score || 0) * weight;
        totalWeight += weight;
    });

    const predicted = Math.round(weightedSum / totalWeight);
    el.innerText = `%${predicted}`;
}

async function loadTopicProgress(userId, results) {
    if (!state.isMounted) return;
    try {
        const [topicsSnap, progressSnap, userSnap] = await Promise.all([
            getDocs(query(collection(db, "topics"), orderBy("order", "asc"))),
            getDocs(collection(db, `users/${userId}/topic_progress`)),
            getDoc(doc(db, "users", userId))
        ]);

        if (!state.isMounted) return;

        const topics = topicsSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        const progressMap = new Map(progressSnap.docs.map(docSnap => [docSnap.id, docSnap.data()]));
        const userData = userSnap.exists() ? userSnap.data() : {};
        state.statsResetAt = normalizeResetTimestamp(userData.statsResetAt);
        state.topicResets = normalizeTopicResets(userData.topicResets);
        state.currentTopicId = resolveCurrentTopicId(
            userData.currentTopicId,
            normalizeResetTimestamp(userData.currentTopicUpdatedAt),
            state.statsResetAt,
            state.topicResets
        );

        const categoryTotals = buildCategoryTotals(results, topics, state.topicResets);
        const successMap = buildTopicSuccessMap(topics, categoryTotals);

        if (!state.isMounted) return;

        renderTopicList(topics, progressMap, state.currentTopicId, successMap, state.topicResets, state.statsResetAt);
        renderTopicChart(categoryTotals);

        return categoryTotals;
    } catch (e) {
        console.error("Topic progress load error", e);
    }
}

function buildTopicSuccessMap(topics, categoryTotals) {
    const successMap = new Map();
    topics.forEach(topic => {
        const stats = categoryTotals[topic.title];
        if (stats && stats.total > 0) {
            successMap.set(topic.id, Math.round((stats.correct / stats.total) * 100));
        } else {
            successMap.set(topic.id, 0);
        }
    });
    return successMap;
}

function renderTopicList(topics, progressMap, currentTopicId, successMap, topicResets, statsResetAt) {
    if (!state.isMounted) return;
    const container = document.getElementById('topicMasteryList');
    if (!container) return;

    if (!topics.length) {
        container.innerHTML = '<tr><td colspan="4" class="text-center p-4">Konu bulunamadı.</td></tr>';
        return;
    }

    // Build Rows
    container.innerHTML = topics.map(topic => {
        const progress = progressMap.get(topic.id) || {};
        const status = getTopicStatus(topic.id, progressMap, currentTopicId, topicResets, statsResetAt);
        const success = successMap.get(topic.id) || 0;

        let statusBadge = '';
        if (status === 'completed') statusBadge = '<span class="status-pill status-completed">TAMAMLANDI</span>';
        else if (status === 'in_progress') statusBadge = '<span class="status-pill status-in-progress">ÇALIŞILIYOR</span>';
        else statusBadge = '<span class="status-pill status-pending">BEKLİYOR</span>';

        const isCurrent = topic.id === currentTopicId;
        const rowClass = isCurrent ? 'topic-row active-focus' : 'topic-row'; // active-focus CSS ekleyebiliriz sonra
        const focusTitle = isCurrent ? 'Odaklanmayı kaldır' : 'Bu konuya odaklan';
        const focusIcon = isCurrent ? '🚫' : '🎯';

        return `
            <tr class="${rowClass}" data-status="${status}">
                <td>
                    <div class="topic-info-cell">
                        <div class="topic-name">${topic.title} ${isCurrent ? '⚡' : ''}</div>
                        <div class="topic-desc">${topic.description || 'Açıklama yok'}</div>
                    </div>
                </td>
                <td>
                    <div class="progress-mini-wrapper">
                        <div class="progress-mini-fill" style="width: ${success}%"></div>
                    </div>
                    <span class="progress-mini-percent">%${success}</span>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button class="action-btn" title="Dışarıda tamamlandı olarak işaretle" onclick="window.toggleTopicStatus('${topic.id}', 'completed')">
                            ✅
                        </button>
                        <button class="action-btn" title="${focusTitle}" onclick="window.setFocusTopic('${topic.id}')">
                            ${focusIcon}
                        </button>
                        <button class="action-btn" title="Konu istatistiklerini sıfırla" onclick="window.resetTopicStats('${topic.id}')">
                            ♻️
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    bindTopicFilters();
}

function getTopicStatus(topicId, progressMap, currentTopicId, topicResets, statsResetAt) {
    const progress = progressMap.get(topicId);
    const progressUpdatedAt = normalizeResetTimestamp(progress?.updatedAt);
    if (statsResetAt && progressUpdatedAt && progressUpdatedAt <= statsResetAt) return 'pending';
    const topicResetAt = topicResets?.[topicId];
    if (topicResetAt && progressUpdatedAt && progressUpdatedAt <= topicResetAt) return 'pending';
    if (progress?.status === 'completed') return 'completed';
    if (progress?.status === 'in_progress' || topicId === currentTopicId) return 'in_progress';
    return 'pending';
}

function bindTopicFilters() {
    if (!state.isMounted) return;
    const chips = document.querySelectorAll('#topicFilterChips button');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Görsel update
            chips.forEach(c => {
                c.classList.remove('status-in-progress');
                c.classList.add('status-pending');
                c.style.color = 'var(--text-muted)';
            });
            chip.classList.remove('status-pending');
            chip.classList.add('status-in-progress');
            chip.style.color = '';

            const filter = chip.dataset.filter;
            const rows = document.querySelectorAll('.topic-row');

            rows.forEach(row => {
                if (filter === 'all') {
                    row.style.display = 'table-row';
                } else {
                    const status = row.dataset.status;
                    if (status === filter) row.style.display = 'table-row';
                    else row.style.display = 'none';
                }
            });
        });
    });
}

// Global actions for onclick handlers
window.toggleTopicStatus = async (topicId, newStatus) => {
    if (!state.isMounted) return;
    const shouldUpdate = await showConfirm("Konu durumunu güncellemek istiyor musunuz?", {
        title: "Durumu Güncelle",
        confirmText: "Evet, güncelle",
        cancelText: "Vazgeç",
        tone: "warning"
    });
    if (!shouldUpdate) return;
    try {
        await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), {
            status: newStatus,
            manualCompleted: true,
            updatedAt: serverTimestamp()
        }, { merge: true });

        // Reload data
        loadTopicProgress(state.userId, state.results);
    } catch (e) {
        console.error("Status update error", e);
        showToast("İşlem sırasında bir hata oluştu.", "error");
    }
};

window.setFocusTopic = async (topicId) => {
    if (!state.isMounted) return;
    try {
        const isCurrent = state.currentTopicId === topicId;
        await setDoc(doc(db, "users", state.userId), {
            currentTopicId: isCurrent ? null : topicId,
            currentTopicUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        if (!isCurrent) {
            await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), {
                status: 'in_progress',
                updatedAt: serverTimestamp()
            }, { merge: true });
        }

        // Refresh UI
        loadTopicProgress(state.userId, state.results);
    } catch (e) {
        console.error("Focus error", e);
    }
}

window.resetTopicStats = async (topicId) => {
    if (!state.isMounted) return;
    const shouldReset = await showConfirm("Bu konuya ait istatistikleri sıfırlamak istiyor musunuz?", {
        title: "Konu İstatistiklerini Sıfırla",
        confirmText: "Evet, sıfırla",
        cancelText: "Vazgeç",
        tone: "warning"
    });
    if (!shouldReset) return;
    try {
        const updates = {
            topicResets: {
                [topicId]: serverTimestamp()
            },
            updatedAt: serverTimestamp()
        };
        if (state.currentTopicId === topicId) {
            updates.currentTopicId = null;
            updates.currentTopicUpdatedAt = serverTimestamp();
        }

        await setDoc(doc(db, "users", state.userId), updates, { merge: true });
        await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), {
            status: 'pending',
            manualCompleted: false,
            updatedAt: serverTimestamp()
        }, { merge: true });

        loadTopicProgress(state.userId, state.results);
    } catch (e) {
        console.error("Reset topic stats error", e);
        showToast("Konu istatistikleri sıfırlanamadı.", "error");
    }
};

async function resetAllStats() {
    if (!state.isMounted) return;
    const shouldReset = await showConfirm("Tüm istatistiklerinizi sıfırlamak istediğinizden emin misiniz?", {
        title: "Tüm İstatistikleri Sıfırla",
        confirmText: "Evet, sıfırla",
        cancelText: "Vazgeç",
        tone: "warning"
    });
    if (!shouldReset) return;
    try {
        await setDoc(doc(db, "users", state.userId), {
            statsResetAt: serverTimestamp(),
            topicResets: {},
            currentTopicId: null,
            currentTopicUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        initAnalysis(state.userId);
    } catch (e) {
        console.error("Reset all stats error", e);
        showToast("İstatistikler sıfırlanamadı.", "error");
    }
}

function bindResetButtons() {
    if (!state.isMounted) return;
    const resetAllButton = document.getElementById('resetAllStatsBtn');
    if (!resetAllButton || resetAllButton.dataset.bound === 'true') return;
    resetAllButton.addEventListener('click', resetAllStats);
    resetAllButton.dataset.bound = 'true';
}


/* --- LEVEL SYSTEM (Önceki lojikten uyarlandı) --- */
async function renderLevelSystem(userId, results, topicResets, statsResetAt) {
    if (!state.isMounted) return; // 🛑 HATA BURADA ÇIKIYORDU: Sayfa kapanınca çalışmamalı
    const currentLevelEl = document.getElementById('currentLevel');
    if (!currentLevelEl) return; // DOM elementi yoksa dur

    // Burada tekrar progress çekmek yerine cache'den kullanılabilir ama
    // fonksiyon yapısı gereği yeniden çekiyoruz, optimize edilebilir.
    try {
        const [topicsSnap, progressSnap] = await Promise.all([
            getDocs(query(collection(db, "topics"))),
            getDocs(collection(db, `users/${userId}/topic_progress`))
        ]);

        if (!state.isMounted) return;

        const topics = topicsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const progressMap = new Map(progressSnap.docs.map(d => [d.id, d.data()]));

        // XP Hesaplama
        const totalCorrect = results.reduce((acc, curr) => acc + (curr.correct || 0), 0);
        const totalSessions = results.length;
        const completedTopics = [...progressMap.entries()].filter(([topicId, progress]) => {
            const progressUpdatedAt = normalizeResetTimestamp(progress?.updatedAt);
            if (statsResetAt && progressUpdatedAt && progressUpdatedAt <= statsResetAt) return false;
            const topicResetAt = topicResets?.[topicId];
            if (topicResetAt && progressUpdatedAt && progressUpdatedAt <= topicResetAt) return false;
            return progress.status === 'completed';
        }).length;

        // Basit XP Formülü
        const xp = (totalCorrect * 2) + (totalSessions * 20) + (completedTopics * 50);

        // Seviyeler
        const levels = [
            { level: 1, name: 'Çaylak', minXp: 0 },
            { level: 2, name: 'Hırslı', minXp: 500 },
            { level: 3, name: 'Usta', minXp: 1500 },
            { level: 4, name: 'Efsane', minXp: 3000 }
        ];

        const currentLevelIdx = levels.reduce((acc, curr, idx) => xp >= curr.minXp ? idx : acc, 0);
        const currentLvl = levels[currentLevelIdx];
        const nextLvl = levels[currentLevelIdx + 1] || null;

        // UI Update
        if (!currentLevelEl) return; // Double check
        currentLevelEl.innerText = `${currentLvl.name} (Lv.${currentLvl.level})`;

        const currentLevelXpEl = document.getElementById('currentLevelXp');
        if (currentLevelXpEl) currentLevelXpEl.innerText = `${xp} XP`;

        const currentLevelBadgeEl = document.getElementById('currentLevelBadge');
        if (currentLevelBadgeEl) currentLevelBadgeEl.innerText = `Seviye ${currentLvl.level}`;

        const progressBar = document.getElementById('levelProgressBar');
        const progressText = document.getElementById('levelProgressText');
        const nextTarget = document.getElementById('levelNextTarget');

        if (nextLvl) {
            const range = nextLvl.minXp - currentLvl.minXp;
            const currentProgress = xp - currentLvl.minXp;
            const percent = Math.min(100, Math.round((currentProgress / range) * 100));

            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) progressText.innerText = `${currentProgress} / ${range} XP`;
            if (nextTarget) nextTarget.innerText = `Sonraki: ${nextLvl.name}`;
        } else {
            if (progressBar) progressBar.style.width = `100%`;
            if (progressText) progressText.innerText = `Max Seviye`;
            if (nextTarget) nextTarget.innerText = ``;
        }

        // Missions (Real Data)
        const streakDays = calculateStudyStreak(results);
        const missionHTML = `
            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; align-items:center; gap:10px;">
                <div style="font-size:1.5rem;">🔥</div>
                <div>
                    <div style="font-weight:bold; font-size:0.85rem;">Haftalık Seri</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${streakDays} Gün</div>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; display:flex; align-items:center; gap:10px;">
                 <div style="font-size:1.5rem;">📚</div>
                <div>
                    <div style="font-weight:bold; font-size:0.85rem;">Konu Avcısı</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${completedTopics} Tamamlanan</div>
                </div>
            </div>
        `;
        const missionListEl = document.getElementById('missionList');
        if (missionListEl) missionListEl.innerHTML = missionHTML;
    } catch (e) {
        console.error("Level system error", e);
    }
}

function calculateStudyStreak(results) {
    if (!results.length) return 0;
    const dateSet = new Set();
    results.forEach(item => {
        if (!item.completedAt?.seconds) return;
        const dayKey = new Date(item.completedAt.seconds * 1000).toISOString().slice(0, 10);
        dateSet.add(dayKey);
    });
    return dateSet.size; // Basit count şimdilik
}
