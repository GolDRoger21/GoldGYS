import { db } from "../../firebase-config.js";
import { 
    collection, 
    getCountFromServer, 
    query, 
    orderBy, 
    limit, 
    getDocs,
    doc,     // <-- YENİ EKLENDİ
    getDoc   // <-- YENİ EKLENDİ
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

        // HTML oluştur
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
            const statsRef = doc(db, "stats", "daily_users");
            const statsSnap = await getDoc(statsRef);

            if (statsSnap.exists()) {
                const data = statsSnap.data();
                // Tarihleri sırala ve son 7 günü al
                const sortedDates = Object.keys(data).sort().slice(-7);
                
                if (sortedDates.length > 0) {
                    labels = sortedDates.map(d => {
                        // 2023-10-25 -> 25 Ekim formatı
                        const dateObj = new Date(d);
                        return dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
                    });
                    dataValues = sortedDates.map(d => data[d]);
                }
            }
        } catch (e) {
            console.warn("Grafik verisi çekilemedi (Henüz veri oluşmamış olabilir):", e);
        }

        // Grafiği Çiz
        if (dashboardCharts.users) dashboardCharts.users.destroy();
        
        dashboardCharts.users = new Chart(ctxUsers, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Yeni Üyeler',
                    data: dataValues,
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
                        callbacks: {
                            title: (items) => items[0].label
                        }
                    }
                },
                scales: {
                    y: { 
                        beginAtZero: true, 
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { stepSize: 1, color: '#64748b' } // Ondalık sayı gösterme
                    },
                    x: { 
                        grid: { display: false },
                        ticks: { color: '#64748b' }
                    }
                }
            }
        });
    }

    // 2. PASTA GRAFİK (Gerçek Veriye Bağlı Dağılım)
    const ctxQuestions = document.getElementById('questionsChart');
    if (ctxQuestions) {
        if (dashboardCharts.questions) dashboardCharts.questions.destroy();

        const { labels, dataValues } = await getQuestionDistribution();

        dashboardCharts.questions = new Chart(ctxQuestions, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: buildChartColors(labels.length),
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

async function getQuestionDistribution() {
    try {
        const snapshot = await getDocs(collection(db, "questions"));
        if (snapshot.empty) {
            return { labels: ['Veri Yok'], dataValues: [0] };
        }

        const counts = snapshot.docs.reduce((acc, docSnap) => {
            const data = docSnap.data();
            const category = (data.category || 'Diğer').trim();
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});

        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const top = sorted.slice(0, 3);
        const remainder = sorted.slice(3);

        if (remainder.length > 0) {
            const restCount = remainder.reduce((sum, [, value]) => sum + value, 0);
            top.push(['Diğer', restCount]);
        }

        return {
            labels: top.map(([label]) => label),
            dataValues: top.map(([, value]) => value)
        };
    } catch (error) {
        console.warn("Kategori dağılımı alınamadı:", error);
        return { labels: ['Veri Yok'], dataValues: [0] };
    }
}

function buildChartColors(size) {
    const palette = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#6366f1', '#14b8a6'];
    return Array.from({ length: size }, (_, index) => palette[index % palette.length]);
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
                userTbody.innerHTML = snapshot.docs.map(doc => {
                    const data = doc.data();
                    // Tarih güvenliği
                    let dateStr = "-";
                    if (data.createdAt && data.createdAt.toDate) {
                        dateStr = data.createdAt.toDate().toLocaleDateString('tr-TR');
                    }

                    return `
                        <tr>
                            <td>
                                <div style="font-weight: 500; color: var(--text-primary);">${data.displayName || 'İsimsiz'}</div>
                            </td>
                            <td style="color: var(--text-muted); font-size: 0.9em;">${data.email}</td>
                            <td><span style="font-size: 0.85em; opacity: 0.7;">${dateStr}</span></td>
                        </tr>
                    `;
                }).join('');
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
                reportTbody.innerHTML = snapshot.docs.map(doc => {
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
        } catch (error) {
            // Rapor koleksiyonu yoksa sessiz kal
            reportTbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Veri yok.</td></tr>';
        }
    }
}
