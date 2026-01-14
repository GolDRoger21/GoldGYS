// public/js/dashboard.js

import { initLayout } from './ui-loader.js';
import { auth } from "./firebase-config.js";
import { getUserProfile } from "./user-profile.js";
import './header-manager.js'; // Import header manager

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
        if(ui.loaderText) ui.loaderText.textContent = "Sistem başlatılıyor...";

        // 1. Merkezi Layout Yükleyicisini Bekle
        // (Header, Sidebar, Auth Kontrolü, Admin Rolü, Mobil Menü - hepsi burada halledilir)
        await initLayout();

        // 2. Dashboard'a Özel İçeriği Hazırla
        const user = auth.currentUser;
        
        if (user) {
            if(ui.loaderText) ui.loaderText.textContent = "Verileriniz yükleniyor...";
            
            // Profil bilgisini çek (Welcome mesajı için)
            // Not: Header zaten ui-loader tarafından güncellendi.
            const profile = await getUserProfile(user.uid);
            const displayName = profile?.ad || user.displayName || (user.email ? user.email.split('@')[0] : 'Kullanıcı');

            if(ui.welcomeMsg) {
                ui.welcomeMsg.textContent = `Hoş geldin, ${displayName}!`;
            }

            // Geri Sayım Sayacını Başlat
            startCountdown();
        }

        // 3. Her şey hazır, sayfa yükleyicisini kaldır
        hideLoader();

    } catch (error) {
        console.error("Dashboard yükleme hatası:", error);
        if(ui.loaderText) {
            ui.loaderText.innerHTML = "Bir hata oluştu.<br>Lütfen sayfayı yenileyin.";
            ui.loaderText.style.color = "#ef4444";
        }
    }
});

function hideLoader() {
    if(ui.loader) {
        ui.loader.style.opacity = "0";
        setTimeout(() => {
            ui.loader.style.display = "none";
            if(ui.mainWrapper) {
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