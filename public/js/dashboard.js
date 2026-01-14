// public/js/dashboard.js

// --- IMPORTLAR ---
import { initLayout } from './ui-loader.js';
import { auth } from "./firebase-config.js";
import { getUserProfile } from "./user-profile.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- UI ELEMENTLERİ ---
const ui = {
    loader: document.getElementById("pageLoader"),
    loaderText: document.getElementById("loaderText"),
    welcomeMsg: document.getElementById("welcomeMsg"),
    mainWrapper: document.getElementById("mainWrapper"),
    countdown: document.getElementById("countdownDays")
};

// --- SAYFA BAŞLANGICI ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        if (ui.loaderText) ui.loaderText.textContent = "Arayüz yükleniyor...";

        // 1. Header ve Sidebar'ı Yükle (ui-loader tüm genel işlemleri yapar)
        await initLayout();

        // 2. Kullanıcı Oturumunu Dinle (Dashboard'a özel veriler için)
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                if (ui.loaderText) ui.loaderText.textContent = "Verileriniz hazırlanıyor...";

                // Dashboard Mesajı İçin Profil Adını Çek
                const profile = await getUserProfile(user.uid);
                const displayName = profile?.ad || user.displayName || user.email.split('@')[0];

                if (ui.welcomeMsg) {
                    ui.welcomeMsg.textContent = `Hoş geldin, ${displayName}!`;
                }

                // Geri Sayım Sayacını Başlat
                startCountdown();

                // Yükleme Ekranını Kaldır
                hideLoader();

            } else {
                // Kullanıcı yoksa Login'e yönlendir
                window.location.href = '/public/login.html';
            }
        });

    } catch (error) {
        console.error("Dashboard hatası:", error);
        if (ui.loaderText) {
            ui.loaderText.innerHTML = "Bir hata oluştu.<br>Sayfayı yenileyin.";
            ui.loaderText.style.color = "#ef4444";
        }
    }
});

// --- YARDIMCI FONKSİYONLAR ---

function hideLoader() {
    if (ui.loader) {
        ui.loader.style.opacity = "0";
        setTimeout(() => {
            ui.loader.style.display = "none";
            if (ui.mainWrapper) {
                ui.mainWrapper.style.display = "block";
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

    updateTimer();
    setInterval(updateTimer, 60000); // 1 dakikada bir güncelle
}