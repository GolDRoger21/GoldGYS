// public/js/analysis.js

import { db, auth } from "./firebase-config.js";
import { collection, query, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Renk Paleti (Tokens.css ile uyumlu)
const COLORS = {
    gold: '#D4AF37',
    goldLight: 'rgba(212, 175, 55, 0.2)',
    success: '#10b981',
    danger: '#ef4444',
    text: '#94A3B8',
    grid: '#334155'
};

document.addEventListener('DOMContentLoaded', () => {
    // Auth durumunu bekle
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await initAnalysis(user.uid);
        } else {
            // ui-loader zaten yönlendirir ama güvenlik önlemi:
            console.warn("Analiz için giriş gerekli.");
        }
    });
});

async function initAnalysis(userId) {
    const loadingEl = document.getElementById('loadingStats');
    const contentEl = document.getElementById('statsContent');

    try {
        // 1. Verileri Çek (Son 20 Sınav)
        const resultsRef = collection(db, `users/${userId}/exam_results`);
        const q = query(resultsRef, orderBy('completedAt', 'desc'), limit(20));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            loadingEl.innerHTML = `
                <div class="card" style="text-align:center; padding:40px;">
                    <h3>Henüz veri yok 📉</h3>
                    <p style="color:var(--text-muted);">Sınav çözdükçe istatistikleriniz burada oluşacak.</p>
                    <a href="testler.html" class="btn btn-primary" style="margin-top:10px; display:inline-block;">Test Çöz</a>
                </div>`;
            return;
        }

        const results = [];
        snapshot.forEach(doc => results.push(doc.data()));

        // Verileri tarihe göre eskiden yeniye sırala (Grafik için)
        const sortedResults = [...results].reverse();

        // 2. İstatistikleri Hesapla ve Yaz
        calculateSummary(results);

        // 3. Grafikleri Çiz
        renderProgressChart(sortedResults);
        renderRatioChart(results);

        // 4. Tabloyu Doldur
        renderHistoryTable(results);

        // 5. Yüklemeyi Bitir
        loadingEl.style.display = 'none';
        contentEl.style.display = 'block';

    } catch (error) {
        console.error("Analiz hatası:", error);
        loadingEl.innerHTML = `<div style="color:red; text-align:center;">Veriler yüklenirken hata oluştu: ${error.message}</div>`;
    }
}

function calculateSummary(results) {
    let totalTests = results.length;
    let totalScore = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalQuestions = 0;

    results.forEach(r => {
        totalScore += Number(r.score || 0);
        totalCorrect += Number(r.correct || 0);
        totalWrong += Number(r.wrong || 0);
        totalQuestions += Number(r.total || 0);
    });

    const avgScore = totalTests > 0 ? (totalScore / totalTests).toFixed(1) : 0;
    const netAvg = totalTests > 0 ? ((totalCorrect - (totalWrong * 0.25)) / totalTests).toFixed(1) : 0; // 4 yanlış 1 doğru hesabı varsa

    document.getElementById('totalTests').textContent = totalTests;
    document.getElementById('avgScore').textContent = `%${avgScore}`;
    document.getElementById('totalQuestions').textContent = totalQuestions;
    document.getElementById('successRate').textContent = netAvg;
}

function renderProgressChart(data) {
    const ctx = document.getElementById('progressChart').getContext('2d');
    
    // Verileri hazırla
    const labels = data.map((_, index) => `Sınav ${index + 1}`);
    const scores = data.map(r => r.score);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Puan Gelişimi',
                data: scores,
                borderColor: COLORS.gold,
                backgroundColor: COLORS.goldLight,
                borderWidth: 3,
                tension: 0.4, // Eğrisel çizgi
                pointBackgroundColor: '#fff',
                pointRadius: 4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    titleColor: COLORS.gold,
                    callbacks: {
                        label: function(context) {
                            return ` Puan: ${context.parsed.y}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: COLORS.text }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: COLORS.text }
                }
            }
        }
    });
}

function renderRatioChart(results) {
    const ctx = document.getElementById('ratioChart').getContext('2d');
    
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalEmpty = 0;

    results.forEach(r => {
        totalCorrect += r.correct;
        totalWrong += r.wrong;
        // Toplam sorudan (D+Y) çıkarınca boş bulunur
        const empty = r.total - (r.correct + r.wrong);
        totalEmpty += empty > 0 ? empty : 0;
    });

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Doğru', 'Yanlış', 'Boş'],
            datasets: [{
                data: [totalCorrect, totalWrong, totalEmpty],
                backgroundColor: [COLORS.success, COLORS.danger, '#64748B'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: COLORS.text, padding: 20 }
                }
            },
            cutout: '70%' // Ortası delik halka
        }
    });
}

function renderHistoryTable(results) {
    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = results.map(r => {
        // Tarih formatlama
        let dateStr = "-";
        if (r.completedAt && r.completedAt.seconds) {
            dateStr = new Date(r.completedAt.seconds * 1000).toLocaleDateString('tr-TR');
        }

        const net = (r.correct - (r.wrong * 0.25)).toFixed(2);
        
        return `
        <tr>
            <td style="color:var(--text-muted);">${dateStr}</td>
            <td style="font-weight:500;">${r.examId === 'custom' ? 'Konu Tarama' : r.examId}</td>
            <td><span class="badge ${r.score >= 70 ? 'success' : 'warning'}">%${r.score}</span></td>
            <td>
                <span style="color:var(--color-success)">${r.correct} D</span> / 
                <span style="color:var(--color-danger)">${r.wrong} Y</span>
            </td>
            <td style="font-weight:bold; color:var(--text-white);">${net}</td>
        </tr>`;
    }).join('');
}