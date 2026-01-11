import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from "./user-profile.js";

// UI Elementleri
const ui = {
    loader: document.getElementById("pageLoader"),
    mainWrapper: document.getElementById("mainWrapper"),
    welcomeMsg: document.getElementById("welcomeMsg"),
    headerUserName: document.getElementById("headerUserName"),
    userAvatar: document.getElementById("userAvatar"),
    sidebar: document.getElementById("sidebar"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),
    adminMenuWrapper: document.getElementById("adminMenuWrapper"),
    logoutBtn: document.getElementById("logoutBtn"),
    countdown: document.getElementById("countdownDays"),
    menuToggle: document.getElementById("menuToggle"),
    closeSidebar: document.getElementById("closeSidebar")
};

// Sayfa Yüklenince
document.addEventListener("DOMContentLoaded", () => {
    initMobileMenu();
});

// 1. OTURUM VE YETKİ KONTROLÜ
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Kullanıcı aktif:", user.uid);
        
        try {
            // A. Profil Bilgilerini Çek
            const profile = await getUserProfile(user.uid);
            updateDashboardUI(user, profile);

            // B. Admin/Editör Yetki Kontrolü
            // Token'ı yenileyerek en güncel yetkileri al
            const tokenResult = await user.getIdTokenResult(true); 
            const claims = tokenResult.claims;

            if (claims.admin || claims.editor) {
                console.log("Yönetici yetkisi algılandı.");
                if (ui.adminMenuWrapper) {
                    ui.adminMenuWrapper.style.display = "block";
                }
            }

            // C. Sayaç Başlat
            startCountdown();

            // D. Yükleme Ekranını Kaldır, İçeriği Göster
            hideLoader();

        } catch (error) {
            console.error("Dashboard yükleme hatası:", error);
            // Hata olsa bile kullanıcıyı içeride tut ama loader'ı kapat
            hideLoader();
        }

    } else {
        // Kullanıcı giriş yapmamışsa Login'e at
        console.warn("Oturum kapalı. Yönlendiriliyor...");
        window.location.replace("/login.html");
    }
});

// Yardımcı: UI Güncelleme
function updateDashboardUI(user, profile) {
    // İsim Belirleme (Önce Profil, Sonra Google, Sonra Varsayılan)
    const name = profile?.ad || user.displayName || "Öğrenci";
    
    // Header ve Karşılama Güncelle
    if(ui.welcomeMsg) ui.welcomeMsg.textContent = `Hoş geldin, ${name}`;
    if(ui.headerUserName) ui.headerUserName.textContent = name;

    // Avatar Belirleme
    let avatarUrl = user.photoURL; // Google fotosu
    if (profile?.photoURL) avatarUrl = profile.photoURL; // Özel yüklenen foto
    
    // Avatar yoksa baş harflerden oluştur
    if (!avatarUrl) {
        avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=D4AF37&color=0F172A&bold=true`;
    }
    
    if(ui.userAvatar) ui.userAvatar.src = avatarUrl;
}

// Yardımcı: Loader Gizle
function hideLoader() {
    if(ui.loader) ui.loader.style.display = "none";
    if(ui.mainWrapper) {
        ui.mainWrapper.style.display = "block";
        setTimeout(() => {
            ui.mainWrapper.style.opacity = "1";
        }, 50); // Fade-in efekti için minik gecikme
    }
}

// 2. ÇIKIŞ İŞLEMİ
if (ui.logoutBtn) {
    ui.logoutBtn.addEventListener("click", async () => {
        if (confirm("Çıkış yapmak istediğinize emin misiniz?")) {
            try {
                // Loader'ı tekrar aç (kullanıcı beklesin)
                if(ui.loader) ui.loader.style.display = "flex";
                if(ui.mainWrapper) ui.mainWrapper.style.opacity = "0";

                await signOut(auth);
                window.location.replace("/login.html");
            } catch (error) {
                console.error("Çıkış hatası:", error);
                alert("Çıkış yapılırken bir hata oluştu.");
                hideLoader(); // Hata olursa geri dön
            }
        }
    });
}

// 3. MOBİL MENÜ MANTIĞI
function initMobileMenu() {
    const toggleMenu = () => {
        if(ui.sidebar) ui.sidebar.classList.toggle("active");
        if(ui.sidebarOverlay) ui.sidebarOverlay.classList.toggle("active");
    };

    if (ui.menuToggle) ui.menuToggle.addEventListener("click", toggleMenu);
    if (ui.closeSidebar) ui.closeSidebar.addEventListener("click", toggleMenu);
    if (ui.sidebarOverlay) ui.sidebarOverlay.addEventListener("click", toggleMenu);
}

// 4. SINAV GERİ SAYIM (Sabit Tarih: 1 Haziran 2026 - Örnek)
function startCountdown() {
    if (!ui.countdown) return;
    
    const examDate = new Date("2026-06-01T09:00:00").getTime();
    
    const timer = setInterval(() => {
        const now = new Date().getTime();
        const distance = examDate - now;

        if (distance < 0) {
            clearInterval(timer);
            ui.countdown.textContent = "0";
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        ui.countdown.textContent = days;
    }, 1000);
}