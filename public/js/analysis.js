import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const state = {
    userId: null,
    results: [],
    currentTopicId: null,
    statsResetAt: null,
    topicResets: {}
};

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.userId = user.uid;
            initAnalysis(user.uid);
        } else {
            window.location.href = '/login.html';
        }
    });
});

async function initAnalysis(userId) {
    try {
        const resultsRef = collection(db, `users/${userId}/exam_results`);
        // Son 100 sınavı çekip client-side filtreleyebiliriz veya 20 yeterli
        const q = query(resultsRef, orderBy('completedAt', 'desc'), limit(50));
        const [snapshot, userSnap] = await Promise.all([
            getDocs(q),
            getDoc(doc(db, "users", userId))
        ]);

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

        calculateKPIs(filteredResults);
        renderProgressChart(filteredResults);
        renderHistoryTable(filteredResults);
        calculatePredictedScore(filteredResults);

        // Topic loading
        await loadTopicProgress(userId, filteredResults);
        renderLevelSystem(userId, filteredResults, state.topicResets, state.statsResetAt); // Değişti: asenkron yükleme içine alındı
        bindResetButtons();

        document.getElementById('lastUpdate').innerText = `Son Güncelleme: ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
        document.getElementById('lastUpdate').classList.remove('status-in-progress');
        document.getElementById('lastUpdate').classList.add('status-completed');
    } catch (error) {
        console.error("Analiz hatası:", error);
        document.getElementById('lastUpdate').innerText = "Hata oluştu";
        document.getElementById('lastUpdate').classList.add('status-pending');
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

    document.getElementById('totalExams').innerText = totalExams;
    document.getElementById('avgScore').innerText = `%${avgScore}`;
    document.getElementById('totalQuestions').innerText = totalQuestions;
    document.getElementById('wrongRate').innerText = `%${wrongRate}`;
}

function renderProgressChart(results) {
    // Son 10 sınav
    const chartData = [...results].slice(0, 10).reverse();
    const ctx = document.getElementById('progressChart').getContext('2d');

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
    // En düşük 5 konuyu gösterelim (Zayıflık Analizi)
    // Ya da hepsini gösterip radar ile genel durumu verelim.
    const labels = Object.keys(categoryTotals);
    const data = labels.map(cat => {
        const t = categoryTotals[cat];
        return t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
    });

    const ctx = document.getElementById('topicChart').getContext('2d');

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
    // Weighted average
    const recentExams = results.slice(0, 5).reverse();
    if (recentExams.length === 0) {
        document.getElementById('predictedScore').innerText = '-';
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
    document.getElementById('predictedScore').innerText = `%${predicted}`;
}

async function loadTopicProgress(userId, results) {
    const [topicsSnap, progressSnap, userSnap] = await Promise.all([
        getDocs(query(collection(db, "topics"), orderBy("order", "asc"))),
        getDocs(collection(db, `users/${userId}/topic_progress`)),
        getDoc(doc(db, "users", userId))
    ]);

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

    renderTopicList(topics, progressMap, state.currentTopicId, successMap, state.topicResets, state.statsResetAt);
    renderTopicChart(categoryTotals);

    // Level datasını hesaplamak için de lazım olacak
    return categoryTotals;
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
                    // Filtreleme mantığı: 
                    // completed -> completed
                    // in_progress -> in_progress
                    // pending -> pending
                    if (status === filter) row.style.display = 'table-row';
                    else row.style.display = 'none';
                }
            });
        });
    });
}

// Global actions for onclick handlers
window.toggleTopicStatus = async (topicId, newStatus) => {
    if (!confirm("Konu durumunu güncellemek istiyor musunuz?")) return;
    try {
        await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), {
            status: newStatus,
            manualCompleted: true,
            updatedAt: serverTimestamp()
        }, { merge: true });

        // Reload data
        loadTopicProgress(state.userId, state.results);
        // Level XP'yi de update etmek gerekebilir ama şimdilik reload yetmeyebilir, tam refresh daha temiz
        // initAnalysis(state.userId); // Bu biraz ağır olabilir, sadece ilgili kısımları update etmek daha iyi
    } catch (e) {
        console.error("Status update error", e);
        alert("Hata oluştu");
    }
};

window.setFocusTopic = async (topicId) => {
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
    if (!confirm("Bu konuya ait istatistikleri sıfırlamak istiyor musunuz?")) return;
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
        alert("Hata oluştu");
    }
};

async function resetAllStats() {
    if (!confirm("Tüm istatistiklerinizi sıfırlamak istediğinizden emin misiniz?")) return;
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
        alert("Hata oluştu");
    }
}

function bindResetButtons() {
    const resetAllButton = document.getElementById('resetAllStatsBtn');
    if (!resetAllButton || resetAllButton.dataset.bound === 'true') return;
    resetAllButton.addEventListener('click', resetAllStats);
    resetAllButton.dataset.bound = 'true';
}


/* --- LEVEL SYSTEM (Önceki lojikten uyarlandı) --- */
async function renderLevelSystem(userId, results, topicResets, statsResetAt) {
    // Burada tekrar progress çekmek yerine cache'den kullanılabilir ama
    // fonksiyon yapısı gereği yeniden çekiyoruz, optimize edilebilir.
    const [topicsSnap, progressSnap] = await Promise.all([
        getDocs(query(collection(db, "topics"))),
        getDocs(collection(db, `users/${userId}/topic_progress`))
    ]);

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
    document.getElementById('currentLevel').innerText = `${currentLvl.name} (Lv.${currentLvl.level})`;
    document.getElementById('currentLevelXp').innerText = `${xp} XP`;
    document.getElementById('currentLevelBadge').innerText = `Seviye ${currentLvl.level}`;

    if (nextLvl) {
        const range = nextLvl.minXp - currentLvl.minXp;
        const currentProgress = xp - currentLvl.minXp;
        const percent = Math.min(100, Math.round((currentProgress / range) * 100));

        document.getElementById('levelProgressBar').style.width = `${percent}%`;
        document.getElementById('levelProgressText').innerText = `${currentProgress} / ${range} XP`;
        document.getElementById('levelNextTarget').innerText = `Sonraki: ${nextLvl.name}`;
    } else {
        document.getElementById('levelProgressBar').style.width = `100%`;
        document.getElementById('levelProgressText').innerText = `Max Seviye`;
        document.getElementById('levelNextTarget').innerText = ``;
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
    document.getElementById('missionList').innerHTML = missionHTML;
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
