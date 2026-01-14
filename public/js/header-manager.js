// public/js/header-manager.js

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth } from "./firebase-config.js";

// Global scope'a ekliyoruz ki HTML'den erişebilelim
window.toggleUserMenu = function() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

// Menü dışına tıklanırsa kapat
document.addEventListener('click', function(event) {
    const container = document.querySelector('.user-menu-container');
    const dropdown = document.getElementById('userDropdown');
    if (container && dropdown && !container.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

// Çıkış Fonksiyonu
window.handleLogout = async function() {
    if(confirm('Çıkış yapmak istiyor musunuz?')) {
        try {
            await auth.signOut();
            window.location.href = '/login.html'; // Redirect to login page
        } catch (error) {
            console.error("Çıkış yapılırken hata oluştu:", error);
            alert("Çıkış işlemi sırasında bir hata oluştu.");
        }
    }
}

// Auth state listener to populate user info
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. Header Profil Bilgilerini Doldur
        const nameDisplay = document.getElementById('dropdownName');
        const emailDisplay = document.getElementById('dropdownEmail');
        const avatarImg = document.getElementById('headerAvatarImg');

        if(nameDisplay) nameDisplay.innerText = user.displayName || 'Kullanıcı';
        if(emailDisplay) emailDisplay.innerText = user.email;
        if(avatarImg && user.photoURL) avatarImg.src = user.photoURL;

        // 2. Kullanıcı Admin mi? (Portal Sidebar için)
        const adminLinkContainer = document.getElementById('admin-link-container');
        if (adminLinkContainer) {
            // Check for admin custom claims
            const token = await user.getIdTokenResult();
            if (token.claims.admin || token.claims.role === 'admin') {
                adminLinkContainer.classList.remove('hidden'); 
                adminLinkContainer.style.display = 'block';
            }
        }
    }
});
