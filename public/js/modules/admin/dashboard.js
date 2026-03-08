import { db } from "../../firebase-config.js";
import { 
    collection, 
    getCountFromServer, 
    query, 
    orderBy, 
    limit, 
    getDocs,
    where
} from "../../firestore-metrics.js";

// Chart (Grafik) nesnelerini saklamak için global değişken
let dashboardCharts = {
    users: null,
    questions: null
};

const DASHBOARD_CACHE_KEY = "admin_dashboard_cache_v1";
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;
let dashboardBootstrapped = false;
const DASHBOARD_SHARD_QUERY_LIMIT = 1000;

function readDashboardCache() {
    try {
        const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.savedAt || (Date.now() - parsed.savedAt) > DASHBOARD_CACHE_TTL_MS) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function writeDashboardCache(patch) {
    try {
        const current = readDashboardCache() || {};
        sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({
            ...current,
            ...patch,
            savedAt: Date.now()
        }));
    } catch (_) {
        // sessionStorage engellendiyse sessizce devam et
    }
}

/**
 * Dashboard sayfası yüklendiğinde çalışacak ana fonksiyon.
 * Her bir parça birbirinden bağımsız çalışır (Biri hata verirse diğerleri çalışmaya devam eder).
 */
export async function initDashboard() {
    console.log("🚀 Dashboard başlatılıyor...");

    // 1. Tarihi Göster (Senkron işlem, bekleme yapmaz)
    updateDateDisplay();

    // 2. Varsa cache'i hemen göster (anlık geçiş hissi)
    hydrateDashboardFromCache();

    // 3. Ağ isteklerini arkaplanda başlat (UI bloke olmasın)
    loadStatsSafe();
    initChartsSafe();
    loadTablesSafe();

    dashboardBootstrapped = true;
}

function hydrateDashboardFromCache() {
    if (!dashboardBootstrapped) return;
    const cached = readDashboardCache();
    if (!cached) return;

    if (cached.stats) {
        renderStats(cached.stats);
    }

    if (Array.isArray(cached.recentUsers)) {
        renderRecentUsers(cached.recentUsers);
    }

    if (Array.isArray(cached.recentReports)) {
        renderRecentReports(cached.recentReports);
    }

    if (cached.userTrend) {
        renderUsersChart(cached.userTrend);
    }
}

function renderStats(stats) {
    const container = document.getElementById('statsGrid');
    if (!container) return;

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

        renderStats(stats);
        writeDashboardCache({ stats });

    } catch (error) {
        console.error("İstatistik yükleme hatası:", error);
        container.innerHTML = `<div style="color: var(--text-muted); padding: 10px;">Veriler alınamadı.</div>`;
    }
}

/**
 * Grafikleri Başlatır (Gerçek Veri ile)
 */
async function initChartsSafe() {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js yüklenemedi, grafikler atlanıyor.");
        return;
    }

    // 1. ÜYE GRAFİĞİ (GERÇEK VERİ)
    const ctxUsers = document.getElementById('usersChart');
    if (ctxUsers) {
        // İstatistik dokümanını çek
        let labels = ['Veri Yok'];
        let dataValues = [0];

        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(endDate.getDate() - 6);
            const startKey = startDate.toISOString().slice(0, 10);
            const endKey = endDate.toISOString().slice(0, 10);

            const statsQuery = query(
                collection(db, "stats", "daily_users_shards", "shards"),
                where("date", ">=", startKey),
                where("date", "<=", endKey),
                limit(DASHBOARD_SHARD_QUERY_LIMIT)
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
            if (sortedDates.length > 0) {
                labels = sortedDates.map(d => {
                    const dateObj = new Date(d);
                    return dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                });
                dataValues = sortedDates.map(d => aggregated.get(d) || 0);
            }

            writeDashboardCache({ userTrend: { labels, dataValues } });
        } catch (e) {
            console.warn("Grafik verisi çekilemedi (Henüz veri oluşmamış olabilir):", e);
        }

        renderUsersChart({ labels, dataValues });
    }

    // 2. PASTA GRAFİK (Şimdilik statik kalabilir veya aynı mantıkla bağlanabilir)
    const ctxQuestions = document.getElementById('questionsChart');
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

function renderUsersChart({ labels = ['Veri Yok'], dataValues = [0] }) {
    const ctxUsers = document.getElementById('usersChart');
    if (!ctxUsers || typeof Chart === 'undefined') return;

    if (dashboardCharts.users) dashboardCharts.users.destroy();

    dashboardCharts.users = new Chart(ctxUsers, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Yeni Üyeler',
                data: dataValues,
                borderColor: '#D4AF37',
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
                    callbacks: {
                        title: (items) => items[0].label
                    }
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

/**
 * Alt Tabloları Doldurur (Limit 5)
 */
async function loadTablesSafe() {
    // --- Son Üyeler ---
    const userTbody = document.getElementById('recentUsersTable');
    if (userTbody) {
        try {
            const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(5));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) {
                userTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#666;">Henüz üye yok.</td></tr>';
            } else {
                const users = snapshot.docs.map(doc => {
                    const data = doc.data();
                    // Tarih güvenliği
                    let dateStr = "-";
                    if (data.createdAt && data.createdAt.toDate) {
                        dateStr = data.createdAt.toDate().toLocaleDateString('tr-TR');
                    }

                    return {
                        displayName: data.displayName || 'İsimsiz',
                        email: data.email || '-',
                        dateStr
                    };
                });

                renderRecentUsers(users);
                writeDashboardCache({ recentUsers: users });
            }
        } catch (error) {
            console.warn("Üye tablosu hatası (Index gerekebilir):", error);
            userTbody.innerHTML = '<tr><td colspan="3" style="color:orange; text-align:center;">Veri alınamadı (Index Eksik Olabilir).</td></tr>';
        }
    }

    // --- Son Raporlar ---
    const reportTbody = document.getElementById('recentReportsTable');
    if (reportTbody) {
        try {
            const q = query(collection(db, "reports"), orderBy("createdAt", "desc"), limit(5));
            const snapshot = await getDocs(q);

            if (snapshot.empty) {
                reportTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#666;">Bildirim yok.</td></tr>';
            } else {
                const reports = snapshot.docs.map(doc => {
                    const data = doc.data();
                    const statusColor = data.status === 'resolved' ? '#10b981' : '#ef4444';
                    return {
                        type: data.type || 'Genel',
                        description: data.description || '-',
                        statusColor
                    };
                });

                renderRecentReports(reports);
                writeDashboardCache({ recentReports: reports });
            }
        } catch (error) {
            // Rapor koleksiyonu yoksa sessiz kal
            reportTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Veri yok.</td></tr>';
        }
    }
}

function renderRecentUsers(users) {
    const userTbody = document.getElementById('recentUsersTable');
    if (!userTbody) return;
    if (!users.length) {
        userTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#666;">Henüz üye yok.</td></tr>';
        return;
    }

    userTbody.innerHTML = users.map((user) => `
        <tr>
            <td>
                <div style="font-weight: 500; color: var(--text-primary);">${user.displayName}</div>
            </td>
            <td style="color: var(--text-muted); font-size: 0.9em;">${user.email}</td>
            <td><span style="font-size: 0.85em; opacity: 0.7;">${user.dateStr}</span></td>
        </tr>
    `).join('');
}

function renderRecentReports(reports) {
    const reportTbody = document.getElementById('recentReportsTable');
    if (!reportTbody) return;
    if (!reports.length) {
        reportTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#666;">Bildirim yok.</td></tr>';
        return;
    }

    reportTbody.innerHTML = reports.map((report) => `
        <tr>
            <td>${report.type}</td>
            <td style="max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${report.description}</td>
            <td><span style="width: 10px; height: 10px; background: ${report.statusColor}; display: inline-block; border-radius: 50%;"></span></td>
        </tr>
    `).join('');
}
