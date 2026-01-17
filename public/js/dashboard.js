// public/js/dashboard.js

import { initLayout } from './ui-loader.js';
import { auth } from "./firebase-config.js";
import { getUserProfile, getLastActivity } from "./user-profile.js";

// UI Elementleri
const ui = {
    loader: document.getElementById("pageLoader"),
    loaderText: document.getElementById("loaderText"),
    welcomeMsg: document.getElementById("welcomeMsg"),
    mainWrapper: document.getElementById("mainWrapper"),
    countdown: document.getElementById("countdownDays")
};

document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (ui.loaderText) ui.loaderText.textContent = "Sistem başlatılıyor...";

        // 1. Merkezi Layout Yükleyicisini Bekle
        // (Header, Sidebar, Auth Kontrolü, Admin Rolü, Mobil Menü - hepsi burada halledilir)
        await initLayout();

        // 2. Dashboard'a Özel İçeriği Hazırla
        const user = auth.currentUser;

        if (user) {
            if (ui.loaderText) ui.loaderText.textContent = "Verileriniz yükleniyor...";

            // Profil bilgisini çek (Welcome mesajı için)
            // Not: Header zaten ui-loader tarafından güncellendi.
            const profile = await getUserProfile(user.uid);
            const displayName = profile?.ad || user.displayName || (user.email ? user.email.split('@')[0] : 'Kullanıcı');

            if (ui.welcomeMsg) {
                ui.welcomeMsg.textContent = `Hoş geldin, ${displayName}!`;
            }

            // Geri Sayım Sayacını Başlat
            startCountdown();

            // Son aktiviteyi ve akıllı ipucunu göster
            checkLastActivity(user);
            showSmartTip();
        }

        // 3. Her şey hazır, sayfa yükleyicisini kaldır
        hideLoader();

    } catch (error) {
        console.error("Dashboard yükleme hatası:", error);
        if (ui.loaderText) {
            ui.loaderText.innerHTML = "Bir hata oluştu.<br>Lütfen sayfayı yenileyin.";
            ui.loaderText.style.color = "#ef4444";
        }
    }
});

function hideLoader() {
    if (ui.loader) {
        ui.loader.style.opacity = "0";
        setTimeout(() => {
            ui.loader.style.display = "none";
            if (ui.mainWrapper) {
                ui.mainWrapper.style.display = "block";
                // Yumuşak geçiş efekti
                requestAnimationFrame(() => {
                    ui.mainWrapper.style.opacity = "1";
                });
            }
        }, 400);
    }
}

function startCountdown() {
    if (!ui.countdown) return;
    // Hedef tarih: 1 Haziran 2026 09:00
    const examDate = new Date("2026-06-01T09:00:00").getTime();

    const updateTimer = () => {
        const now = new Date().getTime();
        const distance = examDate - now;

        if (distance < 0) {
            ui.countdown.textContent = "0";
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        ui.countdown.textContent = days;
    };

    updateTimer(); // İlk açılışta hemen çalıştır
    setInterval(updateTimer, 60000); // Dakikada bir güncelle
}

async function checkLastActivity(user) {
    const activity = await getLastActivity(user.uid);
    const card = document.getElementById('lastActivityCard');

    if (activity && card) {
        const timeAgo = new Date(activity.timestamp.seconds * 1000).toLocaleDateString('tr-TR');

        card.innerHTML = `
            <div class="card p-3 d-flex justify-content-between align-items-center" style="background: linear-gradient(to right, var(--bg-surface), var(--bg-hover)); border-left: 4px solid var(--color-primary);">
                <div>
                    <small class="text-muted text-uppercase" style="font-size:0.75rem;">Son Çalışılan</small>
                    <h4 class="m-0" style="color:var(--text-main);">${activity.title}</h4>
                    <small class="text-muted">${activity.subTitle || 'Konu Çalışması'} • ${timeAgo}</small>
                </div>
                <a href="/pages/konu.html?id=${activity.id}" class="btn btn-sm btn-primary">
                    Devam Et ▶
                </a>
            </div>
        `;
        card.style.display = 'block';
    }
}

function showSmartTip() {
    // Basit bir mantık: Rastgele bir motivasyon veya hatırlatma
    const tips = [
        "💡 İpucu: Yanlış yaptığın soruları 'Yanlışlarım' sayfasından tekrar çözebilirsin.",
        "🔥 Motivasyon: Günde sadece 20 soru çözerek hedefine ulaşabilirsin.",
        "📚 Hatırlatma: 'Anayasa Hukuku' konusunda eksiklerin var gibi görünüyor."
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];

    // Dashboard'da uygun bir yere ekle (Örn: Quick Access altına veya üstüne)
    // Şimdilik container'ın başına veya sonuna ekleyebiliriz ama hoşdurması için stats-grid'den hemen sonraya ekleyelim
    // Veya welcome bölümünün altına. Kullanıcının isteği: "Dashboard'da uygun bir yere ekle"

    // Mevcut yapıda welcome-section bittikten sonra, lastActivityCard var. Onun da altına koyabiliriz.
    // Ancak daha temiz görünmesi için lastActivityCard varsa onun altına, yoksa welcome altına.
    const container = document.querySelector('.dashboard-container');
    const target = document.getElementById('lastActivityCard');

    const tipDiv = document.createElement('div');
    tipDiv.className = 'alert alert-info mb-4';
    tipDiv.style.background = 'rgba(59, 130, 246, 0.1)';
    tipDiv.style.border = '1px solid rgba(59, 130, 246, 0.2)';
    tipDiv.style.color = 'var(--text-main)';
    tipDiv.innerHTML = randomTip;

    if (target) {
        target.parentNode.insertBefore(tipDiv, target.nextSibling);
    } else {
        container.appendChild(tipDiv);
    }
}