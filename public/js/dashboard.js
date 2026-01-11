// public/js/dashboard.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elementleri
const ui = {
    loader: document.getElementById("pageLoader"),
    appContent: document.getElementById("appContent"),
    welcomeMsg: document.getElementById("welcomeMsg"),
    userAvatar: document.getElementById("userAvatar"),
    logoutBtn: document.getElementById("logoutBtn"),
    adminPanelBtn: document.getElementById("adminPanelBtn"),
    
    // Mobil Menü
    sidebar: document.getElementById("sidebar"),
    overlay: document.getElementById("sidebarOverlay"),
    menuToggle: document.getElementById("menuToggle"),
    closeSidebar: document.getElementById("closeSidebar"),
    
    // Stats
    countdownValue: document.getElementById("countdownValue"),
    statSuccessBar: document.getElementById("statSuccessBar"),
    statSuccessText: document.getElementById("statSuccessText")
};

// 1. GÜVENLİK VE BAŞLATMA
document.addEventListener("DOMContentLoaded", () => {
    // Sayfa ilk açıldığında Loader aktif (HTML'de varsayılan öyle)
    initMobileMenu();
    startCountdown();
});

// 2. AUTH DİNLEYİCİSİ (ANA MANTIK)
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Oturum doğrulandı:", user.uid);

        try {
            // A. Kullanıcı Profili ve UI Güncelle
            await updateDashboard(user);

            // B. Admin Yetki Kontrolü
            const tokenResult = await user.getIdTokenResult();
            if (tokenResult.claims.admin || tokenResult.claims.editor) {
                if (ui.adminPanelBtn) ui.adminPanelBtn.style.display = "flex";
            }

            // C. GÜVENLİ AÇILIŞ: Loader'ı gizle, içeriği göster
            if (ui.loader) ui.loader.style.display = "none";
            if (ui.appContent) ui.appContent.style.display = "block";

        } catch (error) {
            console.error("Dashboard yükleme hatası:", error);
            // Hata olsa bile içeriği aç ki sonsuz döngüde kalmasın (veya hata mesajı göster)
            if (ui.loader) ui.loader.style.display = "none";
            if (ui.appContent) ui.appContent.style.display = "block";
        }

    } else {
        // Oturum yoksa Login'e yönlendir
        console.warn("Oturum yok, yönlendiriliyor...");
        window.location.href = "/login.html";
    }
});

// 3. UI GÜNCELLEME FONKSİYONLARI
async function updateDashboard(user) {
    // Varsayılan isim
    let displayName = user.displayName || user.email.split('@')[0];
    let photoURL = user.photoURL;

    // Firestore'dan ek bilgi çekmeye çalış (İsim, soyisim vs.)
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.ad && data.soyad) {
                displayName = `${data.ad} ${data.soyad}`;
            }
            // İleride statSuccessBar vs. buradan güncellenebilir.
        }
    } catch (e) {
        console.log("Firestore profil verisi çekilemedi, varsayılanlar kullanılıyor.");
    }

    // Ekrana yaz
    if (ui.welcomeMsg) ui.welcomeMsg.textContent = `Hoş geldin, ${displayName}`;
    
    // Avatar
    if (!photoURL) {
        photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=D4AF37&color=0F172A&bold=true`;
    }
    if (ui.userAvatar) ui.userAvatar.src = photoURL;
    
    // Statik Animasyonlar (Örnek)
    if(ui.statSuccessBar) {
        setTimeout(() => {
            ui.statSuccessBar.style.width = "65%";
            if(ui.statSuccessText) ui.statSuccessText.textContent = "%65";
        }, 500);
    }
}

// 4. MOBİL MENÜ MANTIĞI
function initMobileMenu() {
    const toggle = () => {
        ui.sidebar.classList.toggle("active");
        ui.overlay.classList.toggle("active");
    };

    if(ui.menuToggle) ui.menuToggle.addEventListener("click", toggle);
    if(ui.closeSidebar) ui.closeSidebar.addEventListener("click", toggle);
    if(ui.overlay) ui.overlay.addEventListener("click", toggle);
}

// 5. ÇIKIŞ YAP
if (ui.logoutBtn) {
    ui.logoutBtn.addEventListener("click", async () => {
        if (confirm("Güvenli çıkış yapmak istiyor musunuz?")) {
            await signOut(auth);
            window.location.href = "/login.html";
        }
    });
}

// 6. GERİ SAYIM
function startCountdown() {
    if (!ui.countdownValue) return;
    const examDate = new Date("2026-06-01T09:00:00").getTime();
    
    const tick = () => {
        const now = new Date().getTime();
        const diff = examDate - now;
        if (diff < 0) {
            ui.countdownValue.textContent = "0";
            return;
        }
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        ui.countdownValue.textContent = days;
    };
    tick();
}