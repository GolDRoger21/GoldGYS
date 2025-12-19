import { auth } from "./firebase-config.js";

async function loadComponent(elementId, filePath) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const html = await response.text();
        element.innerHTML = html;
    } catch (error) {
        console.error("Component yüklenemedi:", filePath, error);
    }
}

export async function initLayout(pageKey) {
    // 1. Sidebar ve Header'ı Yükle
    await Promise.all([
        loadComponent('sidebar-area', '/partials/sidebar.html'),
        loadComponent('header-area', '/partials/header.html')
    ]);

    // 2. Aktif Menüyü İşaretle
    if (pageKey) {
        const activeLink = document.querySelector(`.sidebar-menu a[data-page="${pageKey}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }

    // 3. Kullanıcı Bilgisini Getir (Firebase Auth)
    auth.onAuthStateChanged(user => {
        const userNameEl = document.getElementById('headerUserName');
        if (user && userNameEl) {
            // Email'in baş kısmını veya varsa display name'i göster
            userNameEl.innerText = user.displayName || user.email.split('@')[0];
            
            // Admin kontrolü (Custom Claims)
            user.getIdTokenResult().then(idTokenResult => {
                if (idTokenResult.claims.admin) {
                    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
                }
            });
        } else if (!user) {
            // Giriş yapmamışsa login'e at
            window.location.href = '/login.html';
        }
    });
}

// Global Fonksiyonlar (HTML onclick için)
window.toggleSidebar = () => {
    document.querySelector('.app-sidebar').classList.toggle('open');
};

window.handleLogout = () => {
    auth.signOut().then(() => window.location.href = '/login.html');
};