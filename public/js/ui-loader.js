import { auth } from "./firebase-config.js";
import { ensureUserDocument } from "./user-profile.js";

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

export async function initLayout(pageKey, options = {}) {
    const { requireAuth = true } = options;
    // 1. Sidebar ve Header'ı Yükle
    await Promise.all([
        loadComponent('sidebar-area', '/partials/sidebar.html'),
        loadComponent('header-area', '/partials/header.html')
    ]);

    // 2. Aktif Menüyü İşaretle
    if (pageKey) {
        document.querySelectorAll(`.sidebar-nav a[data-page="${pageKey}"], .sidebar-menu a[data-page="${pageKey}"]`)
            .forEach(link => link.classList.add('active'));
        document.querySelectorAll(`.main-nav a[data-page="${pageKey}"]`)
            .forEach(link => link.classList.add('active'));
    }

    // 3. Kullanıcı Bilgisini Getir (Firebase Auth)
    const userNameEl = document.getElementById('headerUserName');
    const userInitialEl = document.getElementById('headerUserInitial');

    if (userNameEl) userNameEl.innerText = 'Yükleniyor…';
    if (userInitialEl) userInitialEl.innerText = '⏳';

    auth.onAuthStateChanged(async user => {
        if (user && (userNameEl || userInitialEl)) {
            const profile = await ensureUserDocument(user);

            const displayName = user.displayName || user.email?.split('@')[0] || 'Kullanıcı';
            if (userNameEl) userNameEl.innerText = displayName;
            if (userInitialEl) userInitialEl.innerText = displayName.charAt(0).toUpperCase();

            try {
                const idTokenResult = await user.getIdTokenResult();
                const hasAdminRole = idTokenResult.claims.admin
                    || idTokenResult.claims.role === 'admin'
                    || profile?.role === 'admin'
                    || profile?.roles?.includes('admin');

                if (hasAdminRole) {
                    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
                }
            } catch (error) {
                console.error('Admin kontrolü sırasında hata:', error);
            }
        } else if (!user && requireAuth) {
            // Giriş yapmamışsa login'e at
            window.location.href = '/login.html';
        }
    });

    // 4. Profil menüsü etkileşimleri
    const profileToggle = document.querySelector('[data-profile-toggle]');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileMenu = document.querySelector('[data-profile-menu]');
    if (profileToggle && profileDropdown && profileMenu) {
        profileToggle.addEventListener('click', event => {
            event.stopPropagation();
            const isOpen = profileDropdown.classList.toggle('open');
            profileToggle.setAttribute('aria-expanded', isOpen);
        });

        document.addEventListener('click', event => {
            if (!profileMenu.contains(event.target)) {
                profileDropdown.classList.remove('open');
                profileToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

// Global Fonksiyonlar (HTML onclick için)
window.toggleSidebar = () => {
    document.querySelector('.app-sidebar').classList.toggle('open');
};

window.handleLogout = () => {
    auth.signOut().then(() => window.location.href = '/login.html');
};
