import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from "./user-profile.js";

// UI Elementleri
const ui = {
    loader: document.getElementById("pageLoader"),
    loaderSpinner: document.getElementById("loaderSpinner"),
    loaderText: document.getElementById("loaderText"),
    loaderSubText: document.getElementById("loaderSubText"),
    authIcon: document.getElementById("authIcon"),
    
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

document.addEventListener("DOMContentLoaded", () => {
    initMobileMenu();
});

// 1. OTURUM KONTROLÜ
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // --- KULLANICI GİRİŞ YAPMIŞSA ---
        console.log("Kullanıcı aktif:", user.uid);
        
        // Loader'da "Veriler alınıyor..." diyebiliriz anlık geçiş için
        if(ui.loaderText) ui.loaderText.textContent = "Verileriniz yükleniyor...";

        try {
            const profile = await getUserProfile(user.uid);
            updateDashboardUI(user, profile);

            const tokenResult = await user.getIdTokenResult(true); 
            const claims = tokenResult.claims;

            if (claims.admin || claims.editor) {
                if (ui.adminMenuWrapper) ui.adminMenuWrapper.style.display = "block";
            }

            startCountdown();
            hideLoader();

        } catch (error) {
            console.error("Dashboard yükleme hatası:", error);
            hideLoader();
        }

    } else {
        // --- KULLANICI YOKSA (GELİŞMİŞ UYARI) ---
        console.warn("Oturum kapalı. Yönlendirme süreci başlatıldı.");
        
        // 1. Spinner'ı gizle
        if(ui.loaderSpinner) ui.loaderSpinner.style.display = "none";
        
        // 2. Kilit ikonunu göster
        if(ui.authIcon) ui.authIcon.style.display = "block";

        // 3. Mesajı güncelle
        if(ui.loaderText) {
            ui.loaderText.innerHTML = "Bu sayfayı görüntülemek için <br><strong>Üye Girişi</strong> yapmalısınız.";
            ui.loaderText.style.color = "#ef4444"; // Kırmızımsı uyarı rengi
        }
        
        if(ui.loaderSubText) {
            ui.loaderSubText.style.display = "block"; // "Yönlendiriliyorsunuz" yazısını aç
        }

        // 4. Kısa bir süre mesajı okumasına izin verip yönlendir
        setTimeout(() => {
            window.location.replace("/login.html");
        }, 2000); // 2 saniye bekle
    }
});

function updateDashboardUI(user, profile) {
    const name = profile?.ad || user.displayName || "Öğrenci";
    
    if(ui.welcomeMsg) ui.welcomeMsg.textContent = `Hoş geldin, ${name}`;
    if(ui.headerUserName) ui.headerUserName.textContent = name;

    let avatarUrl = user.photoURL;
    if (profile?.photoURL) avatarUrl = profile.photoURL;
    
    if (!avatarUrl) {
        avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=D4AF37&color=0F172A&bold=true`;
    }
    
    if(ui.userAvatar) ui.userAvatar.src = avatarUrl;
}

function hideLoader() {
    if(ui.loader) {
        ui.loader.style.opacity = "0";
        setTimeout(() => {
            ui.loader.style.display = "none";
            if(ui.mainWrapper) {
                ui.mainWrapper.style.display = "block";
                setTimeout(() => ui.mainWrapper.style.opacity = "1", 50);
            }
        }, 400); // CSS transition süresi kadar bekle
    }
}

// 2. ÇIKIŞ YAPMA
if (ui.logoutBtn) {
    ui.logoutBtn.addEventListener("click", async () => {
        if (confirm("Çıkış yapmak istediğinize emin misiniz?")) {
            try {
                // Loader'ı tekrar aç, mesaj ver
                if(ui.loader) {
                    ui.loader.style.display = "flex";
                    ui.loader.style.opacity = "1";
                    if(ui.loaderText) ui.loaderText.textContent = "Çıkış yapılıyor...";
                    if(ui.loaderSpinner) ui.loaderSpinner.style.display = "block";
                    if(ui.authIcon) ui.authIcon.style.display = "none";
                    if(ui.loaderSubText) ui.loaderSubText.style.display = "none";
                }
                if(ui.mainWrapper) ui.mainWrapper.style.opacity = "0";

                await signOut(auth);
                window.location.replace("/login.html");
            } catch (error) {
                console.error("Çıkış hatası:", error);
                hideLoader();
            }
        }
    });
}

function initMobileMenu() {
    const toggleMenu = () => {
        if(ui.sidebar) ui.sidebar.classList.toggle("active");
        if(ui.sidebarOverlay) ui.sidebarOverlay.classList.toggle("active");
    };

    if (ui.menuToggle) ui.menuToggle.addEventListener("click", toggleMenu);
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
    setInterval(updateTimer, 60000); // Dakikada bir güncelle
}