// public/js/dashboard.js
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from "./user-profile.js";

// DOM Elementleri
const ui = {
    welcomeMsg: document.getElementById("welcomeMsg"),
    userAvatar: document.getElementById("userAvatar"),
    logoutBtn: document.getElementById("logoutBtn"),
    sidebar: document.getElementById("sidebar"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),
    menuToggle: document.getElementById("menuToggle"),
    closeSidebar: document.getElementById("closeSidebar"),
    examCountdown: document.querySelector(".exam-countdown .days"),
    progressBars: document.querySelectorAll(".progress-bar")
};

// Sayfa Yüklendiğinde
document.addEventListener("DOMContentLoaded", () => {
    initMobileMenu();
    animateProgressBars();
    startCountdown();
});

// 1. Auth Durumunu Dinle
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Kullanıcı giriş yaptı:", user.uid);
        
        // Kullanıcı arayüzünü güncelle
        updateDashboardUI(user);

        // Firestore'dan detaylı profil verisi çek (Opsiyonel, user-profile.js varsa)
        try {
            const profile = await getUserProfile(user.uid);
            if (profile && profile.ad) {
                ui.welcomeMsg.textContent = `Hoş geldin, ${profile.ad}`;
            }
        } catch (error) {
            console.log("Profil detayı çekilemedi, varsayılan kullanılıyor.");
        }

    } else {
        // Giriş yapmamışsa login sayfasına at
        console.log("Kullanıcı oturumu kapalı, yönlendiriliyor...");
        window.location.href = "/login.html";
    }
});

// 2. UI Güncelleme Fonksiyonu
function updateDashboardUI(user) {
    const displayName = user.displayName || user.email?.split('@')[0] || "Öğrenci";
    ui.welcomeMsg.textContent = `Hoş geldin, ${displayName}`;
    
    // Avatarı güncelle (Varsa Google fotosu, yoksa baş harfler)
    const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${displayName}&background=D4AF37&color=0F172A&bold=true`;
    if (ui.userAvatar) ui.userAvatar.src = avatarUrl;
}

// 3. Çıkış İşlemi
if (ui.logoutBtn) {
    ui.logoutBtn.addEventListener("click", async () => {
        if (confirm("Çıkış yapmak istediğinize emin misiniz?")) {
            try {
                await signOut(auth);
                window.location.href = "/login.html";
            } catch (error) {
                console.error("Çıkış hatası:", error);
                alert("Çıkış yapılırken bir hata oluştu.");
            }
        }
    });
}

// 4. Mobil Menü Mantığı
function initMobileMenu() {
    const toggleMenu = () => {
        ui.sidebar.classList.toggle("active");
        ui.sidebarOverlay.classList.toggle("active");
    };

    if (ui.menuToggle) ui.menuToggle.addEventListener("click", toggleMenu);
    if (ui.closeSidebar) ui.closeSidebar.addEventListener("click", toggleMenu);
    if (ui.sidebarOverlay) ui.sidebarOverlay.addEventListener("click", toggleMenu);
}

// 5. Basit Animasyonlar (Progress Bar Dolumu)
function animateProgressBars() {
    ui.progressBars.forEach(bar => {
        const width = bar.style.width;
        bar.style.width = "0"; // Önce sıfırla
        setTimeout(() => {
            bar.style.transition = "width 1s ease-out";
            bar.style.width = width; // Sonra hedef değere animasyonla git
        }, 300);
    });
}

// 6. Sınav Geri Sayım Sayacı (Örnek Tarih: 1 Haziran 2026)
function startCountdown() {
    if (!ui.examCountdown) return;
    
    const examDate = new Date("2026-06-01T09:00:00").getTime();
    
    const updateTimer = () => {
        const now = new Date().getTime();
        const distance = examDate - now;

        if (distance < 0) {
            ui.examCountdown.textContent = "0";
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        ui.examCountdown.textContent = days;
    };

    updateTimer(); // İlk açılışta çalıştır
    // setInterval(updateTimer, 86400000); // Her gün güncelle (Gerekirse)
}