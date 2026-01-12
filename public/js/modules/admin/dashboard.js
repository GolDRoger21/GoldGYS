import { db } from "../../firebase-config.js";
import { collection, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function initDashboard() {
    console.log("Dashboard yükleniyor...");
    const container = document.querySelector('#section-dashboard .stats-grid');
    
    if(!container) return;

    // Loading durumu
    container.innerHTML = '<div class="col-span-12">Veriler yükleniyor...</div>';

    try {
        // Paralel olarak verileri çek
        const [usersSnap, questionsSnap, reportsSnap] = await Promise.all([
            getCountFromServer(collection(db, "users")),
            getCountFromServer(collection(db, "questions")),
            getCountFromServer(collection(db, "reports")) // reports koleksiyonu varsa
        ]);

        const stats = [
            { title: "Toplam Üye", value: usersSnap.data().count, icon: "👥", color: "blue" },
            { title: "Soru Bankası", value: questionsSnap.data().count, icon: "📝", color: "green" },
            { title: "Hata Bildirimleri", value: reportsSnap.data().count, icon: "🚩", color: "red" }
        ];

        renderStats(container, stats);

    } catch (error) {
        console.error("Dashboard hatası:", error);
        container.innerHTML = `<div class="error">Veriler alınamadı: ${error.message}</div>`;
    }
}

function renderStats(container, stats) {
    container.innerHTML = stats.map(stat => `
        <div class="stat-card" style="border-left: 4px solid var(--${stat.color || 'gold'})">
            <h3>${stat.icon} ${stat.title}</h3>
            <div class="value">${stat.value}</div>
            <div class="trend text-muted text-sm">Güncel Durum</div>
        </div>
    `).join('');
}