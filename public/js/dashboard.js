// public/js/dashboard.js

import { initLayout } from './ui-loader.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./firebase-config.js";
import { getUserProfile } from "./user-profile.js";

// UI Elementleri (Header haricindeki, sayfaya özel elemanlar)
const ui = {
    loader: document.getElementById("pageLoader"),
    loaderSpinner: document.getElementById("loaderSpinner"),
    loaderText: document.getElementById("loaderText"),
    loaderSubText: document.getElementById("loaderSubText"),
    authIcon: document.getElementById("authIcon"),
    mainWrapper: document.getElementById("mainWrapper"),
    welcomeMsg: document.getElementById("welcomeMsg"),
    sidebar: document.getElementById("sidebar"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),
    countdown: document.getElementById("countdownDays"),
    closeSidebar: document.getElementById("closeSidebar")
};

document.addEventListener("DOMContentLoaded", () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // KULLANICI GİRİŞ YAPMIŞ
            try {
                // 1. Layout'u (header, sidebar) güvenle yükle
                await initLayout('dashboard');

                // 2. Sayfaya özel içeriği yükle
                if(ui.loaderText) ui.loaderText.textContent = "Verileriniz yükleniyor...";
                
                const profile = await getUserProfile(user.uid);
                
                // Gövdeyi (Hoşgeldin mesajı) güncelle
                if(ui.welcomeMsg) {
                    const name = profile?.ad || user.displayName || "Kullanıcı";
                    ui.welcomeMsg.textContent = `Hoş geldin, ${name}!`;
                }

                // Sayfaya özel diğer fonksiyonlar
                startCountdown();
                initMobileMenu(); // initLayout'tan sonra çalışmalı

                // 3. Her şey hazır, yükleyiciyi gizle
                hideLoader();

            } catch (error) {
                console.error("Dashboard yüklenirken bir hata oluştu:", error);
                if(ui.loaderText) ui.loaderText.textContent = "Bir hata oluştu. Lütfen sayfayı yenileyin.";
            }

        } else {
            // KULLANICI GİRİŞ YAPMAMIŞ
            console.warn("Oturum kapalı. Yönlendirme süreci başlatıldı.");
            if(ui.loaderSpinner) ui.loaderSpinner.style.display = "none";
            if(ui.authIcon) ui.authIcon.style.display = "block";
            if(ui.loaderText) {
                ui.loaderText.innerHTML = "Bu sayfayı görüntülemek için <br><strong>Üye Girişi</strong> yapmalısınız.";
                ui.loaderText.style.color = "#ef4444";
            }
            if(ui.loaderSubText) ui.loaderSubText.style.display = "block";
            
            setTimeout(() => {
                window.location.replace("/login.html");
            }, 2500);
        }
    });
});

function hideLoader() {
    if(ui.loader) {
        ui.loader.style.opacity = "0";
        setTimeout(() => {
            ui.loader.style.display = "none";
            if(ui.mainWrapper) {
                ui.mainWrapper.style.display = "block";
                setTimeout(() => ui.mainWrapper.style.opacity = "1", 50);
            }
        }, 400);
    }
}

function initMobileMenu() {
    const menuToggle = document.querySelector('[data-mobile-nav-toggle]');

    const toggleMenu = () => {
        if(ui.sidebar) ui.sidebar.classList.toggle("active");
        if(ui.sidebarOverlay) ui.sidebarOverlay.classList.toggle("active");
    };

    if (menuToggle) menuToggle.addEventListener("click", toggleMenu);
    if (ui.closeSidebar) ui.closeSidebar.addEventListener("click", toggleMenu);
    if (ui.sidebarOverlay) ui.sidebarOverlay.addEventListener("click", toggleMenu);
}

function startCountdown() {
    if (!ui.countdown) return;
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
    setInterval(updateTimer, 60000);
}
