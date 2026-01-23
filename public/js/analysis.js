import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const state = {
    userId: null,
    results: [],
    currentTopicId: null
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
        const q = query(resultsRef, orderBy('completedAt', 'desc'), limit(20));
        const snapshot = await getDocs(q);

        const results = snapshot.docs.map(doc => doc.data());
        state.results = results;

        calculateKPIs(results);
        renderProgressChart(results);
        renderTopicChart(results);
        renderHistoryTable(results);
        renderDetailedStats(results);
        calculatePredictedScore(results);
        await loadTopicProgress(userId, results);

        document.getElementById('lastUpdate').innerText = `Son Güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`;
    } catch (error) {
        console.error("Analiz hatası:", error);
    }
}

function calculateKPIs(results) {
    const totalExams = results.length;
    const totalScore = results.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const avgScore = totalExams > 0 ? Math.round(totalScore / totalExams) : 0;

    const totalQuestions = results.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const totalWrong = results.reduce((acc, curr) => acc + (curr.wrong || 0), 0);
    const wrongRate = totalQuestions > 0 ? Math.round((totalWrong / totalQuestions) * 100) : 0;

    document.getElementById('totalExams').innerText = totalExams;
    document.getElementById('avgScore').innerText = `%${avgScore}`;
    document.getElementById('totalQuestions').innerText = totalQuestions;
    document.getElementById('wrongRate').innerText = `%${wrongRate}`;
}

function renderProgressChart(results) {
    // Grafiği tersten (eskiden yeniye) çizmek için diziyi ters çeviriyoruz
    const chartData = [...results].reverse();
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
                backgroundColor: 'rgba(212, 175, 55, 0.15)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#1e293b', // Dark background to match card
                pointBorderColor: '#D4AF37',
                pointRadius: 5,
                pointHoverRadius: 7
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
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function renderTopicChart(results) {
    const categoryTotals = buildCategoryTotals(results);
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
                pointHoverBorderColor: '#10b981'
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
                    borderColor: '#334155',
                    borderWidth: 1
                }
            },
            scales: {
                r: {
                    suggestedMin: 0,
                    suggestedMax: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    angleLines: { color: 'rgba(255, 255, 255, 0.05)' },
                    pointLabels: {
                        color: '#94a3b8',
                        font: { size: 11 }
                    },
                    ticks: {
                        backdropColor: 'transparent',
                        color: 'transparent' // Hide scale numbers for cleaner look
                    }
                }
            }
        }
    });
}

function renderHistoryTable(results) {
    const tbody = document.getElementById('historyTableBody');
    if (!results.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4">Henüz sınav verisi yok.</td></tr>';
        return;
    }
    tbody.innerHTML = results.map(r => `
        <tr>
            <td>${new Date(r.completedAt.seconds * 1000).toLocaleDateString('tr-TR')}</td>
            <td>${r.examTitle || 'Genel Test'}</td>
            <td>
                <span style="color:var(--color-success)">${r.correct} D</span> / 
                <span style="color:var(--color-danger)">${r.wrong} Y</span> / 
                <span style="color:var(--text-muted)">${r.empty} B</span>
            </td>
            <td>
                <span class="badge" style="background:${r.score >= 70 ? 'var(--color-success)' : 'var(--color-warning)'}; color:#fff; padding:4px 8px; border-radius:4px;">
                    %${r.score}
                </span>
            </td>
        </tr>
    `).join('');
}

function buildCategoryTotals(results) {
    const categoryTotals = {};

    results.forEach(exam => {
        if (!exam.categoryStats) return;
        Object.entries(exam.categoryStats).forEach(([cat, stats]) => {
            if (!categoryTotals[cat]) categoryTotals[cat] = { correct: 0, total: 0 };
            categoryTotals[cat].correct += stats.correct || 0;
            categoryTotals[cat].total += stats.total || 0;
        });
    });

    return categoryTotals;
}

function renderDetailedStats(results) {
    const totalSessions = results.length;
    const totalQuestions = results.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const avgQuestions = totalSessions ? Math.round(totalQuestions / totalSessions) : 0;

    const recentBoundary = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentSessions = results.filter(item => item.completedAt?.seconds ? (item.completedAt.seconds * 1000) >= recentBoundary : false);
    const recentScore = recentSessions.length ? Math.round(recentSessions.reduce((acc, curr) => acc + (curr.score || 0), 0) / recentSessions.length) : 0;

    const daySet = new Set();
    recentSessions.forEach(item => {
        if (!item.completedAt?.seconds) return;
        const dayKey = new Date(item.completedAt.seconds * 1000).toISOString().slice(0, 10);
        daySet.add(dayKey);
    });
    const consistencyScore = Math.round((daySet.size / 30) * 100);

    document.getElementById('recentSuccess').innerText = `%${recentScore}`;
    document.getElementById('consistencyScore').innerText = `%${consistencyScore}`;
    document.getElementById('sessionCount').innerText = totalSessions;
    document.getElementById('avgQuestionsPerSession').innerText = avgQuestions;
    document.getElementById('avgQuestionsPerSession').innerText = avgQuestions;
}

function calculatePredictedScore(results) {
    // Weighted average of last 5 exams (most recent has higher weight)
    const recentExams = results.slice(0, 5).reverse(); // Oldest to newest of the last 5
    if (recentExams.length === 0) {
        document.getElementById('predictedScore').innerText = '-';
        return;
    }

    let totalWeight = 0;
    let weightedSum = 0;

    recentExams.forEach((exam, index) => {
        const weight = index + 1; // 1, 2, 3, 4, 5
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
    const currentTopicId = userSnap.exists() ? userSnap.data().currentTopicId : null;
    state.currentTopicId = currentTopicId;

    const categoryTotals = buildCategoryTotals(results);
    const successMap = buildTopicSuccessMap(topics, categoryTotals);
    const topicMap = new Map(topics.map(topic => [topic.id, topic.title]));

    updateTopicSummary(topics, progressMap, currentTopicId);
    updateCurrentTopicCard(topics, currentTopicId, successMap);
    renderTopicList(topics, progressMap, currentTopicId, successMap);
    renderTopicInsights(successMap, topicMap);
    renderLevelSystem(buildLevelData(results, topics, progressMap));
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

function updateTopicSummary(topics, progressMap, currentTopicId) {
    const total = topics.length;
    let completed = 0;
    let inProgress = 0;

    topics.forEach(topic => {
        const status = getTopicStatus(topic.id, progressMap, currentTopicId);
        if (status === 'completed') completed += 1;
        if (status === 'in_progress') inProgress += 1;
    });

    const remaining = Math.max(total - completed - inProgress, 0);
    const completionRate = total ? Math.round((completed / total) * 100) : 0;

    document.getElementById('topicCompletionRate').innerText = `%${completionRate}`;
    document.getElementById('completedTopicCount').innerText = completed;
    document.getElementById('inProgressTopicCount').innerText = inProgress;
    document.getElementById('remainingTopicCount').innerText = remaining;
    document.getElementById('topicCompletionBar').style.width = `${completionRate}%`;
}

function updateCurrentTopicCard(topics, currentTopicId, successMap) {
    const currentTopic = topics.find(topic => topic.id === currentTopicId);
    const focusBtn = document.getElementById('focusTopicBtn');

    if (!currentTopic) {
        document.getElementById('currentTopicName').innerText = 'Seçili konu yok';
        document.getElementById('currentTopicMeta').innerText = 'Bir konu seçerek odağınızı belirleyebilirsiniz.';
        focusBtn.disabled = true;
        focusBtn.removeAttribute('href');
        focusBtn.onclick = null;
        return;
    }

    const success = successMap.get(currentTopic.id) || 0;
    document.getElementById('currentTopicName').innerText = currentTopic.title;
    document.getElementById('currentTopicMeta').innerText = `${currentTopic.description || 'Konu açıklaması bulunmuyor.'} • Başarı: %${success}`;
    focusBtn.disabled = false;
    focusBtn.onclick = () => {
        window.location.href = `/pages/konu.html?id=${currentTopic.id}`;
    };
}

function renderTopicList(topics, progressMap, currentTopicId, successMap) {
    const container = document.getElementById('topicProgressList');
    const emptyState = document.getElementById('topicProgressEmpty');

    if (!topics.length) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = topics.map(topic => {
        const progress = progressMap.get(topic.id) || {};
        const status = getTopicStatus(topic.id, progressMap, currentTopicId);
        const success = successMap.get(topic.id) || 0;
        const statusLabel = status === 'completed' ? 'Tamamlandı' : status === 'in_progress' ? 'Devam ediyor' : 'Kalan';
        const statusClass = status === 'completed' ? 'status-completed' : status === 'in_progress' ? 'status-progress' : 'status-pending';
        const manualBadge = progress.manualCompleted ? '<span class="badge bg-light text-dark border">Dışarıda tamamlandı</span>' : '';
        const isCurrent = topic.id === currentTopicId;
        const currentLabel = isCurrent ? 'Şu an çalışılıyor' : 'Şu an çalışıyorum';
        const currentDisabled = isCurrent ? 'disabled' : '';
        return `
            <div class="topic-progress-item" data-status="${status}">
                <div>
                    <div class="topic-progress-title">${topic.title}</div>
                    <div class="topic-meta">${topic.description || 'Konu açıklaması bulunmuyor.'}</div>
                    <div class="topic-badges">
                        <span class="status-pill ${statusClass}">${statusLabel}</span>
                        <span class="badge bg-light text-dark border">Başarı %${success}</span>
                        ${manualBadge}
                    </div>
                </div>
                <div>
                    <div class="progress-metric">%${success}</div>
                    <div class="progress-subtext">Konu başarı oranı</div>
                </div>
                <div class="topic-action-group">
                    <label class="toggle-complete">
                        <input type="checkbox" class="topic-complete-toggle" data-topic-id="${topic.id}" ${status === 'completed' ? 'checked' : ''}>
                        Dışarıda tamamladım
                    </label>
                    <button class="btn btn-sm btn-outline-primary topic-current-btn" data-topic-id="${topic.id}" ${currentDisabled}>
                        ${currentLabel}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    bindTopicActions();
    bindTopicFilters();
}

function renderTopicInsights(successMap, topicMap) {
    if (!successMap.size) {
        document.getElementById('bestTopic').innerText = '-';
        document.getElementById('focusTopic').innerText = '-';
        return;
    }

    const sorted = [...successMap.entries()].sort((a, b) => b[1] - a[1]);
    const best = sorted[0];
    const focus = sorted[sorted.length - 1];

    const bestTitle = topicMap.get(best[0]) || '';
    const focusTitle = topicMap.get(focus[0]) || '';
    document.getElementById('bestTopic').innerText = bestTitle ? `${bestTitle} (%${best[1]})` : '-';
    document.getElementById('focusTopic').innerText = focusTitle ? `${focusTitle} (%${focus[1]})` : '-';
}

function getTopicStatus(topicId, progressMap, currentTopicId) {
    const progress = progressMap.get(topicId);
    if (progress?.status === 'completed') return 'completed';
    if (progress?.status === 'in_progress' || topicId === currentTopicId) return 'in_progress';
    return 'pending';
}

function buildLevelData(results, topics, progressMap) {
    const totalCorrect = results.reduce((acc, curr) => acc + (curr.correct || 0), 0);
    const totalQuestions = results.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const totalSessions = results.length;
    const completedTopics = topics.filter(topic => getTopicStatus(topic.id, progressMap, state.currentTopicId) === 'completed').length;
    const accuracy = totalQuestions ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    const weeklyWindow = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const weeklyResults = results.filter(item => item.completedAt?.seconds ? (item.completedAt.seconds * 1000) >= weeklyWindow : false);
    const weeklyExamCount = weeklyResults.length;
    const weeklyQuestionCount = weeklyResults.reduce((acc, curr) => acc + (curr.total || 0), 0);

    const recentTopicWindow = Date.now() - (14 * 24 * 60 * 60 * 1000);
    const recentCompletedTopics = [...progressMap.values()].filter(item => {
        const timestamp = item?.updatedAt?.seconds ? item.updatedAt.seconds * 1000 : null;
        return item?.status === 'completed' && timestamp && timestamp >= recentTopicWindow;
    }).length;

    const topicMastery = topics.length ? Math.round((completedTopics / topics.length) * 100) : 0;
    const studyStreak = calculateStudyStreak(results);

    const xp = (totalCorrect * 2) + (totalSessions * 20) + (completedTopics * 60) + (accuracy * 3);
    const levels = [
        { level: 1, name: 'Başlangıç', minXp: 0 },
        { level: 2, name: 'İvme Kazanan', minXp: 500 },
        { level: 3, name: 'Düzenli Takipçi', minXp: 1100 },
        { level: 4, name: 'Kararlı Öğrenci', minXp: 1800 },
        { level: 5, name: 'Hedef Odaklı', minXp: 2600 },
        { level: 6, name: 'Uzmanlaşan', minXp: 3500 }
    ];

    const currentLevelIndex = levels.reduce((acc, curr, index) => (xp >= curr.minXp ? index : acc), 0);
    const currentLevel = levels[currentLevelIndex];
    const nextLevel = levels[currentLevelIndex + 1] || null;
    const levelRange = nextLevel ? (nextLevel.minXp - currentLevel.minXp) : 1;
    const levelProgress = nextLevel ? Math.min(Math.round(((xp - currentLevel.minXp) / levelRange) * 100), 100) : 100;

    const missions = [
        {
            title: 'Haftalık deneme takibi',
            description: '7 gün içinde 3 deneme çöz.',
            value: weeklyExamCount,
            target: 3
        },
        {
            title: 'Haftalık soru yükü',
            description: '7 gün içinde 250 soru çöz.',
            value: weeklyQuestionCount,
            target: 250
        },
        {
            title: 'Yeni konu tamamla',
            description: 'Son 14 günde 1 konu tamamla.',
            value: recentCompletedTopics,
            target: 1
        },
        {
            title: 'Doğruluk hedefi',
            description: 'Genel başarı oranını %75 üzerine taşı.',
            value: accuracy,
            target: 75,
            unit: '%'
        }
    ];

    return {
        xp,
        currentLevel,
        nextLevel,
        levelProgress,
        levelRange,
        topicMastery,
        studyStreak,
        weeklyExamCount,
        weeklyExamTarget: 3,
        weeklyQuestionCount,
        weeklyQuestionTarget: 250,
        missions
    };
}

function renderLevelSystem(levelData) {
    const {
        xp,
        currentLevel,
        nextLevel,
        levelProgress,
        levelRange,
        topicMastery,
        studyStreak,
        weeklyExamCount,
        weeklyExamTarget,
        weeklyQuestionCount,
        weeklyQuestionTarget,
        missions
    } = levelData;

    document.getElementById('currentLevel').innerText = `Seviye ${currentLevel.level}`;
    document.getElementById('currentLevelXp').innerText = `${xp} XP`;
    document.getElementById('currentLevelBadge').innerText = currentLevel.name;
    document.getElementById('levelProgressBar').style.width = `${levelProgress}%`;
    document.getElementById('levelProgressText').innerText = nextLevel
        ? `${xp - currentLevel.minXp} / ${levelRange} XP`
        : `${xp} XP`;
    document.getElementById('levelNextTarget').innerText = nextLevel
        ? `Sonraki seviye: ${nextLevel.name} (${nextLevel.minXp} XP)`
        : 'Son seviye';
    document.getElementById('studyStreak').innerText = `${studyStreak} gün`;
    document.getElementById('weeklyExamProgress').innerText = `${weeklyExamCount} / ${weeklyExamTarget}`;
    document.getElementById('weeklyQuestionProgress').innerText = `${weeklyQuestionCount} / ${weeklyQuestionTarget}`;
    document.getElementById('topicMastery').innerText = `%${topicMastery}`;

    const missionList = document.getElementById('missionList');
    missionList.innerHTML = missions.map(mission => {
        const progress = Math.min(Math.round((mission.value / mission.target) * 100), 100);
        const isComplete = mission.value >= mission.target;
        const displayValue = mission.unit ? `${mission.value}${mission.unit}` : mission.value;
        const displayTarget = mission.unit ? `${mission.target}${mission.unit}` : mission.target;
        return `
            <div class="mission-item">
                <div class="mission-header">
                    <div>
                        <div class="mission-title">${mission.title}</div>
                        <div class="mission-progress">${mission.description}</div>
                    </div>
                    <span class="mission-status ${isComplete ? 'done' : ''}">${isComplete ? 'Tamamlandı' : 'Devam ediyor'}</span>
                </div>
                <div class="mission-progress">${displayValue} / ${displayTarget}</div>
                <div class="mission-bar"><span style="width:${progress}%"></span></div>
            </div>
        `;
    }).join('');
}

function calculateStudyStreak(results) {
    if (!results.length) return 0;
    const dateSet = new Set();
    results.forEach(item => {
        if (!item.completedAt?.seconds) return;
        const dayKey = new Date(item.completedAt.seconds * 1000).toISOString().slice(0, 10);
        dateSet.add(dayKey);
    });

    const dates = [...dateSet].sort().reverse();
    if (!dates.length) return 0;

    let streak = 0;
    let cursor = new Date(dates[0]);
    for (const dateStr of dates) {
        const date = new Date(dateStr);
        if (date.toDateString() === cursor.toDateString()) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function bindTopicActions() {
    document.querySelectorAll('.topic-complete-toggle').forEach(input => {
        input.addEventListener('change', async (event) => {
            const topicId = event.target.dataset.topicId;
            const isChecked = event.target.checked;
            const status = isChecked ? 'completed' : (topicId === state.currentTopicId ? 'in_progress' : 'pending');
            await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), {
                status,
                manualCompleted: isChecked,
                updatedAt: serverTimestamp()
            }, { merge: true });
            await loadTopicProgress(state.userId, state.results);
        });
    });

    document.querySelectorAll('.topic-current-btn').forEach(button => {
        button.addEventListener('click', async (event) => {
            const topicId = event.currentTarget.dataset.topicId;
            await setDoc(doc(db, "users", state.userId), {
                currentTopicId: topicId,
                updatedAt: serverTimestamp()
            }, { merge: true });
            await setDoc(doc(db, `users/${state.userId}/topic_progress`, topicId), {
                status: 'in_progress',
                updatedAt: serverTimestamp()
            }, { merge: true });
            await loadTopicProgress(state.userId, state.results);
        });
    });
}

function bindTopicFilters() {
    const chips = document.querySelectorAll('#topicFilterChips .chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(btn => btn.classList.remove('active'));
            chip.classList.add('active');
            const filter = chip.dataset.filter;
            document.querySelectorAll('.topic-progress-item').forEach(item => {
                if (filter === 'all') {
                    item.style.display = '';
                    return;
                }
                const matches = item.dataset.status === filter || (filter === 'pending' && item.dataset.status === 'pending');
                item.style.display = matches ? '' : 'none';
            });
        });
    });
}
