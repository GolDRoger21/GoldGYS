import { db, auth } from "./firebase-config.js";
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            initAnalysis(user.uid);
        } else {
            window.location.href = '../login.html';
        }
    });
});

async function initAnalysis(userId) {
    const loadingEl = document.getElementById('loadingStats');
    const contentEl = document.getElementById('statsContent');

    try {
        // Kullanıcının sınav sonuçlarını çek
        const resultsRef = collection(db, `users/${userId}/exam_results`);
        // Son 20 sınavı getir
        const q = query(resultsRef, orderBy('completedAt', 'desc'), limit(20));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            loadingEl.innerHTML = '<div class="alert alert-info">Henüz hiç deneme sınavı çözmediniz. Çözdükçe istatistikleriniz burada belirecek.</div>';
            return;
        }

        const results = [];
        snapshot.forEach(doc => results.push(doc.data()));

        // Verileri İşle
        calculateSummary(results);
        renderProgressChart(results);
        renderTopicChart(results);
        renderHistoryTable(results);

        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

    } catch (error) {
        console.error("Analiz hatası:", error);
        loadingEl.innerHTML = '<div class="text-danger">Veriler yüklenirken bir hata oluştu.</div>';
    }
}

function calculateSummary(results) {
    const totalExams = results.length;
    const totalScore = results.reduce((acc, curr) => acc + curr.score, 0);
    const avgScore = Math.round(totalScore / totalExams);
    
    const totalQuestions = results.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const totalWrong = results.reduce((acc, curr) => acc + curr.wrong, 0);
    const wrongRate = totalQuestions > 0 ? Math.round((totalWrong / totalQuestions) * 100) : 0;

    document.getElementById('statTotalExams').innerText = totalExams;
    document.getElementById('statAvgScore').innerText = `%${avgScore}`;
    document.getElementById('statTotalQuestions').innerText = totalQuestions;
    document.getElementById('statWrongRate').innerText = `%${wrongRate}`;
}

function renderProgressChart(results) {
    // Grafiği tersten (eskiden yeniye) çizmek için diziyi ters çeviriyoruz
    const chartData = [...results].reverse();
    
    const ctx = document.getElementById('progressChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.map(r => new Date(r.completedAt.seconds * 1000).toLocaleDateString('tr-TR', {day:'numeric', month:'short'})),
            datasets: [{
                label: 'Sınav Puanı',
                data: chartData.map(r => r.score),
                borderColor: '#27ae60',
                backgroundColor: 'rgba(39, 174, 96, 0.1)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, max: 100 }
            }
        }
    });
}

function renderTopicChart(results) {
    // Tüm sınavlardaki kategori başarılarını topla
    const categoryTotals = {}; // { "Anayasa": { correct: 10, total: 15 } }

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
        return Math.round((t.correct / t.total) * 100);
    });

    const ctx = document.getElementById('topicChart').getContext('2d');
    new Chart(ctx, {
        type: 'radar', // Veya 'bar' yapabilirsiniz
        data: {
            labels: labels,
            datasets: [{
                label: 'Konu Başarısı (%)',
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgb(54, 162, 235)',
                pointBackgroundColor: 'rgb(54, 162, 235)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgb(54, 162, 235)'
            }]
        },
        options: {
            scales: {
                r: { 
                    angleLines: { display: false },
                    suggestedMin: 0,
                    suggestedMax: 100
                }
            }
        }
    });
}

function renderHistoryTable(results) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = results.map(r => `
        <tr>
            <td>${new Date(r.completedAt.seconds * 1000).toLocaleDateString('tr-TR')}</td>
            <td>${r.examTitle}</td>
            <td>
                <span class="text-success">${r.correct} D</span> / 
                <span class="text-danger">${r.wrong} Y</span> / 
                <span class="text-muted">${r.empty} B</span>
            </td>
            <td><span class="badge ${r.score >= 70 ? 'bg-success' : 'bg-warning'} text-white" style="font-size:0.9rem">%${r.score}</span></td>
        </tr>
    `).join('');
}