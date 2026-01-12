import { db } from "../../firebase-config.js";
import { collection, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function initDashboard() {
    const container = document.querySelector('#section-dashboard .stats-grid');
    if (!container) return;

    // Yükleniyor animasyonu
    container.innerHTML = '<div style="grid-column:1/-1; color:#fff;">Veriler analiz ediliyor...</div>';

    try {
        // Paralel olarak veritabanındaki sayıları çek
        const [usersSnap, questionsSnap, reportsSnap] = await Promise.all([
            getCountFromServer(collection(db, "users")),
            getCountFromServer(collection(db, "questions")),
            getCountFromServer(collection(db, "reports"))
        ]);

        const stats = [
            { 
                label: "Toplam Üye", 
                value: usersSnap.data().count, 
                icon: "👥", 
                color: "#3b82f6" // Mavi
            },
            { 
                label: "Soru Bankası", 
                value: questionsSnap.data().count, 
                icon: "📚", 
                color: "#10b981" // Yeşil
            },
            { 
                label: "Hata Bildirimi", 
                value: reportsSnap.data().count, 
                icon: "🚩", 
                color: "#ef4444" // Kırmızı
            },
            {
                label: "Aktif Oturum",
                value: "Çevrimiçi",
                icon: "🟢",
                color: "#D4AF37" // Altın
            }
        ];

        renderStats(container, stats);

    } catch (error) {
        console.error("Dashboard hatası:", error);
        container.innerHTML = `<div style="color:red">Veri hatası: ${error.message}</div>`;
    }
}

function renderStats(container, stats) {
    container.innerHTML = stats.map(stat => `
        <div class="stat-card" style="border-top: 4px solid ${stat.color}; background: var(--bg-panel); padding: 20px; border-radius: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <div>
                    <h3 style="color:#94a3b8; font-size: 0.9rem; margin-bottom:5px;">${stat.label}</h3>
                    <div style="font-size: 2rem; font-weight:bold; color:#fff;">${stat.value}</div>
                </div>
                <div style="font-size: 1.5rem; background: rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                    ${stat.icon}
                </div>
            </div>
        </div>
    `).join('');
}