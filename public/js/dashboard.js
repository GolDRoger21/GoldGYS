// public/js/dashboard.js

// --- IMPORTLAR ---
import { initLayout } from './ui-loader.js';
import { auth, db } from "./firebase-config.js"; 
import { getUserProfile } from "./user-profile.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
        if(ui.loaderText) ui.loaderText.textContent = "Arayüz yükleniyor...";

        // 1. Header ve Sidebar'ı Yükle
        await initLayout(); 

        // 2. Kullanıcı Oturumunu Dinle
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                if(ui.loaderText) ui.loaderText.textContent = "Verileriniz hazırlanıyor...";
                
                // A. Dashboard Header Bilgilerini Güncelle
                updateHeaderProfile(user);

                // B. Kullanıcı Profilini Veritabanından Çek (Dashboard Mesajı İçin)
                const profile = await getUserProfile(user.uid);
                const displayName = profile?.ad || user.displayName || user.email.split('@')[0];
                
                if(ui.welcomeMsg) {
                    ui.welcomeMsg.textContent = `Hoş geldin, ${displayName}!`;
                }

                // C. Geri Sayım Sayacını Başlat
                startCountdown();

                // D. Yükleme Ekranını Kaldır
                hideLoader();

            } else {
                // Kullanıcı yoksa Login'e yönlendir
                window.location.href = '/public/login.html';
            }
        });

    } catch (error) {
        console.error("Dashboard hatası:", error);
        if(ui.loaderText) {
            ui.loaderText.innerHTML = "Bir hata oluştu.<br>Sayfayı yenileyin.";
            ui.loaderText.style.color = "#ef4444";
        }
    }
});

// --- HEADER YÖNETİMİ (Global Fonksiyonlar) ---
// HTML'deki onclick="toggleUserMenu()" kodunun çalışması için window'a atıyoruz.

window.toggleUserMenu = function() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        // Flex veya Block durumuna göre toggle yap
        const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
        dropdown.style.display = isHidden ? 'block' : 'none';
    }
};

window.handleLogout = async function() {
    if(confirm('Oturumu kapatmak istediğinize emin misiniz?')) {
        try {
            await signOut(auth);
            window.location.href = '/public/login.html';
        } catch (error) {
            console.error("Çıkış hatası:", error);
        }
    }
};

// Menü dışına tıklanırsa kapat
document.addEventListener('click', function(event) {
    const container = document.querySelector('.user-menu-container');
    const dropdown = document.getElementById('userDropdown');
    
    // Tıklanan yer menü değilse ve menü açıksa kapat
    if (container && !container.contains(event.target) && dropdown && dropdown.style.display !== 'none') {
        dropdown.style.display = 'none';
    }
});

// --- YARDIMCI FONKSİYONLAR ---

async function updateHeaderProfile(user) {
    // 1. Profil Resmini ve Adını Header'a Yaz
    const nameEl = document.getElementById('dropdownUserName');
    const emailEl = document.getElementById('dropdownUserEmail');
    const imgEl = document.getElementById('headerAvatarImg');

    if(nameEl) nameEl.textContent = user.displayName || 'Öğrenci';
    if(emailEl) emailEl.textContent = user.email;
    if(imgEl && user.photoURL) imgEl.src = user.photoURL;

    // 2. Admin Linkini Kontrol Et (Custom Claims)
    try {
        const tokenResult = await user.getIdTokenResult();
        const adminLink = document.getElementById('adminPanelLink'); // HTML'de bu ID'yi li'ye verdik
        
        if (adminLink) {
            if (tokenResult.claims.admin || tokenResult.claims.role === 'admin') {
                adminLink.style.display = 'block'; // Adminse göster
            } else {
                adminLink.style.display = 'none'; // Değilse gizle
            }
        }
    } catch (e) {
        console.log("Yetki kontrolü sırasında hata (önemsiz):", e);
    }
}

function hideLoader() {
    if(ui.loader) {
        ui.loader.style.opacity = "0";
        setTimeout(() => {
            ui.loader.style.display = "none";
            if(ui.mainWrapper) {
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