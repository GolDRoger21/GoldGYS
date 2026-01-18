import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            initAnalysis(user.uid);
        } else {
            window.location.href = '/login.html';
        }
    });
});

async function initAnalysis(userId) {
    try {
        // Son 20 sınav sonucunu çek
        const resultsRef = collection(db, `users/${userId}/exam_results`);
        const q = query(resultsRef, orderBy('completedAt', 'desc'), limit(20));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            document.getElementById('historyTableBody').innerHTML = '<tr><td colspan="4" class="text-center p-4">Henüz sınav verisi yok.</td></tr>';
            return;
        }

        const results = [];
        snapshot.forEach(doc => results.push(doc.data()));

        // Verileri İşle ve Göster
        calculateKPIs(results);
        renderProgressChart(results);
        renderTopicChart(results);
        renderHistoryTable(results);

        document.getElementById('lastUpdate').innerText = `Son Güncelleme: ${new Date().toLocaleTimeString()}`;

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

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(r => new Date(r.completedAt.seconds * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })),
            datasets: [{
                label: 'Sınav Puanı',
                data: chartData.map(r => r.score),
                borderColor: '#D4AF37', // Gold
                backgroundColor: 'rgba(212, 175, 55, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#D4AF37',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: 100 }
            }
        }
    });
}

function renderTopicChart(results) {
    // Kategori bazlı başarıyı hesapla
    const categoryTotals = {};

    results.forEach(exam => {
        if (!exam.categoryStats) return;
        Object.entries(exam.categoryStats).forEach(([cat, stats]) => {
            if (!categoryTotals[cat]) categoryTotals[cat] = { correct: 0, total: 0 };
            categoryTotals[cat].correct += stats.correct;
            categoryTotals[cat].total += stats.total;
        });
    });

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
                pointBorderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: { suggestedMin: 0, suggestedMax: 100 }
            }
        }
    });
}

function renderHistoryTable(results) {
    const tbody = document.getElementById('historyTableBody');
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