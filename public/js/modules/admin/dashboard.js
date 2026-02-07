import { db } from "../../firebase-config.js";
import {
    collection,
    getCountFromServer,
    query,
    orderBy,
    limit,
    getDocs,
    where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { CacheManager } from "../cache-manager.js";

// Chart (Grafik) nesnelerini saklamak için global değişken
let dashboardCharts = {
    users: null,
    questions: null
};

/**
 * Dashboard sayfası yüklendiğinde çalışacak ana fonksiyon.
 * Her bir parça birbirinden bağımsız çalışır (Biri hata verirse diğerleri çalışmaya devam eder).
 */
export async function initDashboard() {
    console.log("🚀 Dashboard başlatılıyor...");

    // 1. Tarihi Göster (Senkron işlem, bekleme yapmaz)
    updateDateDisplay();

    // 2. İstatistik Kartlarını Yükle
    await loadStatsSafe();

    // 3. Grafikleri Başlat (Gerçek Veri ile)
    await initChartsSafe();

    // 4. Tabloları Doldur (Son Üyeler ve Raporlar)
    loadTablesSafe();
}

/**
 * Tarih bilgisini günceller
 */
function updateDateDisplay() {
    const dateEl = document.getElementById('currentDateDisplay');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('tr-TR', options);
    }
}

/**
 * İstatistik Kartları (Toplam Sayılar)
 * Hata olursa kullanıcıya "---" gösterir, sayfayı bozmaz.
 */
async function loadStatsSafe() {
    const container = document.getElementById('statsGrid');
    if (!container) return;

    // Cache'den kontrol et
    const cacheKey = 'admin_dashboard_stats';
    const cachedStats = CacheManager.get(cacheKey);

    if (cachedStats) {
        renderStats(container, cachedStats);
        return;
    }

    try {
        // Paralel olarak sayıları çek (Daha hızlı açılış için)
        // Not: 'questions' veya 'reports' koleksiyonun henüz yoksa burası hata verebilir, try-catch bunu yakalar.
        const [usersSnap, questionsSnap, reportsSnap] = await Promise.all([
            getCountFromServer(collection(db, "users")).catch(() => ({ data: () => ({ count: 0 }) })),
            getCountFromServer(collection(db, "questions")).catch(() => ({ data: () => ({ count: 0 }) })),
            getCountFromServer(collection(db, "reports")).catch(() => ({ data: () => ({ count: 0 }) }))
        ]);

        const stats = [
            { label: "Toplam Üye", value: usersSnap.data().count, icon: "👥", color: "#3b82f6" },
            { label: "Soru Bankası", value: questionsSnap.data().count, icon: "📚", color: "#10b981" },
            { label: "Bildirimler", value: reportsSnap.data().count, icon: "🚩", color: "#ef4444" },
            { label: "Sistem", value: "Aktif", icon: "🟢", color: "#D4AF37" }
        ];

        // Cache'e kaydet (5 dakika)
        CacheManager.set(cacheKey, stats, 5 * 60 * 1000);

        renderStats(container, stats);

    } catch (error) {
        console.error("İstatistik yükleme hatası:", error);
        container.innerHTML = `<div style="color: var(--text-muted); padding: 10px;">Veriler alınamadı.</div>`;
    }
}

function renderStats(container, stats) {
    container.innerHTML = stats.map(stat => `
        <div class="stat-card" style="border-left: 4px solid ${stat.color}">
            <div class="stat-info">
                <h3>${stat.label}</h3>
                <div class="value">${stat.value}</div>
            </div>
            <div class="stat-icon" style="color: ${stat.color}">
                ${stat.icon}
            </div>
        </div>
    `).join('');
}

/**
 * Grafikleri Başlatır (Gerçek Veri ile)
 */
async function initChartsSafe() {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js yüklenemedi, grafikler atlanıyor.");
        return;
    }

    const ctxUsers = document.getElementById('usersChart');
    const ctxQuestions = document.getElementById('questionsChart');

    // Users Chart Logic
    if (ctxUsers) {
        const cacheKey = 'admin_dashboard_charts_users';
        let chartData = CacheManager.get(cacheKey);

        if (!chartData) {
            try {
                // Veriyi Çek
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(endDate.getDate() - 6);
                const startKey = startDate.toISOString().slice(0, 10);
                const endKey = endDate.toISOString().slice(0, 10);

                const statsQuery = query(
                    collection(db, "stats", "daily_users_shards", "shards"),
                    where("date", ">=", startKey),
                    where("date", "<=", endKey)
                );
                const statsSnap = await getDocs(statsQuery);

                const aggregated = new Map();
                statsSnap.docs.forEach((docSnap) => {
                    const data = docSnap.data();
                    if (!data?.date) return;
                    const count = Number.isFinite(data.count) ? data.count : 0;
                    aggregated.set(data.date, (aggregated.get(data.date) || 0) + count);
                });

                const sortedDates = Array.from(aggregated.keys()).sort().slice(-7);
                let labels = ['Veri Yok'], dataValues = [0];

                if (sortedDates.length > 0) {
                    labels = sortedDates.map(d => {
                        const dateObj = new Date(d);
                        return dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                    });
                    dataValues = sortedDates.map(d => aggregated.get(d) || 0);
                }

                chartData = { labels, dataValues };

                // Cache'e kaydet (1 saat - günlük veri fazla değişmez)
                CacheManager.set(cacheKey, chartData, 60 * 60 * 1000);

            } catch (e) {
                console.warn("Grafik verisi çekilemedi:", e);
                chartData = { labels: ['Hata'], dataValues: [0] };
            }
        }

        // Grafiği Çiz
        if (dashboardCharts.users) dashboardCharts.users.destroy();

        dashboardCharts.users = new Chart(ctxUsers, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: 'Yeni Üyeler',
                    data: chartData.dataValues,
                    borderColor: '#D4AF37', // Altın Rengi
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
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#fff',
                        bodyColor: '#cbd5e1',
                        padding: 10,
                        displayColors: false,
                        callbacks: { title: (items) => items[0].label }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { stepSize: 1, color: '#64748b' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b' }
                    }
                }
            }
        });
    }

    // Pasta Grafik (Statik - Örnek)
    if (ctxQuestions) {
        if (dashboardCharts.questions) dashboardCharts.questions.destroy();
        dashboardCharts.questions = new Chart(ctxQuestions, {
            type: 'doughnut',
            data: {
                labels: ['Matematik', 'Türkçe', 'Tarih'],
                datasets: [{
                    data: [15, 10, 5],
                    backgroundColor: ['#3b82f6', '#10b981', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', boxWidth: 10 } } }
            }
        });
    }
}

/**
 * Alt Tabloları Doldurur (Limit 5)
 */
async function loadTablesSafe() {
    // Cache Keys
    const userCacheKey = 'admin_dashboard_users';
    const reportCacheKey = 'admin_dashboard_reports';

    // --- Son Üyeler ---
    const userTbody = document.getElementById('recentUsersTable');
    if (userTbody) {
        let rowsHtml = CacheManager.get(userCacheKey);

        if (!rowsHtml) {
            try {
                const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(5));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    rowsHtml = '<tr><td colspan="3" style="text-align:center; color:#666;">Henüz üye yok.</td></tr>';
                } else {
                    rowsHtml = snapshot.docs.map(doc => {
                        const data = doc.data();
                        let dateStr = "-";
                        if (data.createdAt && data.createdAt.toDate) {
                            dateStr = data.createdAt.toDate().toLocaleDateString('tr-TR');
                        }
                        return `
                            <tr>
                                <td><div style="font-weight: 500; color: var(--text-primary);">${data.displayName || 'İsimsiz'}</div></td>
                                <td style="color: var(--text-muted); font-size: 0.9em;">${data.email}</td>
                                <td><span style="font-size: 0.85em; opacity: 0.7;">${dateStr}</span></td>
                            </tr>
                        `;
                    }).join('');
                }
                CacheManager.set(userCacheKey, rowsHtml, 60 * 1000); // 1 dk cache
            } catch (error) {
                console.warn("Üye tablosu hatası:", error);
                rowsHtml = '<tr><td colspan="3" style="color:orange; text-align:center;">Veri alınamadı.</td></tr>';
            }
        }
        userTbody.innerHTML = rowsHtml;
    }

    // --- Son Raporlar ---
    const reportTbody = document.getElementById('recentReportsTable');
    if (reportTbody) {
        let rowsHtml = CacheManager.get(reportCacheKey);

        if (!rowsHtml) {
            try {
                const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(5));
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    rowsHtml = '<tr><td colspan="3" style="text-align:center; color:#666;">Bildirim yok.</td></tr>';
                } else {
                    rowsHtml = snapshot.docs.map(doc => {
                        const data = doc.data();
                        const statusColor = data.status === 'resolved' ? '#10b981' : '#ef4444';
                        return `
                            <tr>
                                <td>${data.type || 'Genel'}</td>
                                <td style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${data.description || '-'}</td>
                                <td><span style="width: 10px; height: 10px; background: ${statusColor}; display: inline-block; border-radius: 50%;"></span></td>
                            </tr>
                        `;
                    }).join('');
                }
                CacheManager.set(reportCacheKey, rowsHtml, 60 * 1000); // 1 dk cache
            } catch (error) {
                rowsHtml = '<tr><td colspan="3" style="text-align:center;">Veri yok.</td></tr>';
            }
        }
        reportTbody.innerHTML = rowsHtml;
    }
}

export function cleanup() {
    if (dashboardCharts.users) {
        dashboardCharts.users.destroy();
        dashboardCharts.users = null;
    }
    if (dashboardCharts.questions) {
        dashboardCharts.questions.destroy();
        dashboardCharts.questions = null;
    }
}
