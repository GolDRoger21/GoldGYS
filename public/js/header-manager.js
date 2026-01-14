// public/js/header-manager.js

import { auth } from "./firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- 1. GLOBAL FONKSİYONLAR ---
// (Eğer başka bir dosyada tanımlanmadıysa burada tanımla)

if (!window.toggleUserMenu) {
    window.toggleUserMenu = function() {
        const dropdown = document.getElementById('userDropdown');
        if (dropdown) {
            // CSS'te 'show' class'ı yerine display style kullanıyoruz
            const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
            dropdown.style.display = isHidden ? 'block' : 'none';
        }
    };
}

if (!window.handleLogout) {
    window.handleLogout = async function() {
        if(confirm('Çıkış yapmak istiyor musunuz?')) {
            try {
                await signOut(auth);
                window.location.href = '/public/login.html'; // Doğru yönlendirme
            } catch (error) {
                console.error("Çıkış hatası:", error);
                alert("Çıkış sırasında bir hata oluştu.");
            }
        }
    };
}

// --- 2. OLAY DİNLEYİCİLERİ ---

// Menü dışına tıklanırsa kapat
document.addEventListener('click', function(event) {
    const container = document.querySelector('.user-menu-container');
    const dropdown = document.getElementById('userDropdown');
    
    // Tıklanan yer menü değilse ve menü açıksa kapat
    if (container && !container.contains(event.target) && dropdown && dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
    }
});

// --- 3. KULLANICI BİLGİLERİNİ DOLDUR ---
// (Admin ve Dashboard dışındaki sayfalar için gereklidir)

onAuthStateChanged(auth, async (user) => {
    if (user) {
        // Profil Bilgilerini Güncelle
        const nameEl = document.getElementById('dropdownUserName'); // ID güncellendi
        const emailEl = document.getElementById('dropdownUserEmail'); // ID güncellendi
        const imgEl = document.getElementById('headerAvatarImg');
        const oldNameEl = document.getElementById('dropdownName'); // Eski ID desteği (yedek)

        const displayName = user.displayName || 'Kullanıcı';

        if(nameEl) nameEl.textContent = displayName;
        if(oldNameEl) oldNameEl.textContent = displayName;
        if(emailEl) emailEl.textContent = user.email;
        if(imgEl && user.photoURL) imgEl.src = user.photoURL;

        // Admin Linkini Kontrol Et (Sidebar için)
        try {
            const adminLinkContainer = document.getElementById('admin-link-container');
            const adminPanelLink = document.getElementById('adminPanelLink'); // Header dropdown'daki link
            
            if (adminLinkContainer || adminPanelLink) {
                const token = await user.getIdTokenResult();
                const isAdmin = token.claims.admin || token.claims.role === 'admin';

                if (isAdmin) {
                    if(adminLinkContainer) {
                        adminLinkContainer.classList.remove('hidden');
                        adminLinkContainer.style.display = 'block';
                    }
                    if(adminPanelLink) {
                        adminPanelLink.style.display = 'block';
                    }
                }
            }
        } catch (e) {
            console.log("Yetki kontrolü (header-manager):", e);
        }
    }
});