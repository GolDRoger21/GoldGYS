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
    // Yeni HTML yapısına göre ID'leri seçiyoruz
    const userNameEl = document.getElementById('headerUserName');
    const userEmailEl = document.getElementById('headerUserEmail');
    const userInitialEl = document.getElementById('headerUserInitial');
    const dropdownInitialEl = document.getElementById('dropdownUserInitial');

    auth.onAuthStateChanged(async user => {
        if (user) {
            // İsim yerine "..." koyarak başla
            if (userNameEl) userNameEl.innerText = 'Kullanıcı';
            
            const profile = await ensureUserDocument(user);
            
            // İsim Belirleme
            let displayName = 'Kullanıcı';
            if (profile && (profile.name || profile.ad)) {
                displayName = `${profile.name || profile.ad} ${profile.surname || profile.soyad || ''}`.trim();
            } else if (user.displayName) {
                displayName = user.displayName;
            } else if (user.email) {
                displayName = user.email.split('@')[0];
            }

            // Baş harf
            const initial = displayName.charAt(0).toUpperCase();

            // HTML'e yerleştirme
            if (userNameEl) userNameEl.innerText = displayName;
            if (userEmailEl) userEmailEl.innerText = user.email || '';
            if (userInitialEl) userInitialEl.innerText = initial;
            if (dropdownInitialEl) dropdownInitialEl.innerText = initial;

            // Admin kontrolü (Mevcut kodunuzu koruyoruz)
            try {
                const idTokenResult = await user.getIdTokenResult();
                const roleFromClaims = idTokenResult.claims.role;
                const roleSet = new Set([
                    roleFromClaims,
                    ...(Array.isArray(profile?.roles) ? profile.roles : []),
                    profile?.role,
                    idTokenResult.claims.admin ? 'admin' : null,
                ].filter(Boolean));

                const hasAdminRole = roleSet.has('admin');
                const hasEditorRole = roleSet.has('editor') || hasAdminRole;

                if (hasAdminRole) {
                    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
                }

                if (hasEditorRole) {
                    document.querySelectorAll('.editor-only').forEach(el => el.style.display = 'block');
                }
            } catch (error) {
                console.error('Admin yetki hatası:', error);
            }

        } else if (!user && requireAuth) {
            window.location.href = '/login.html';
        }
    });

    // 4. Profil menüsü etkileşimleri (Google Style Toggle)
    const profileToggle = document.querySelector('[data-profile-toggle]');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileMenuContainer = document.querySelector('[data-profile-menu]');

    if (profileToggle && profileDropdown && profileMenuContainer) {
        // Tıklama olayı
        profileToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = profileDropdown.classList.contains('open');
            
            if (isOpen) {
                profileDropdown.classList.remove('open');
                profileToggle.setAttribute('aria-expanded', 'false');
            } else {
                profileDropdown.classList.add('open');
                profileToggle.setAttribute('aria-expanded', 'true');
            }
        });

        // Dışarı tıklayınca kapat
        document.addEventListener('click', (event) => {
            if (!profileMenuContainer.contains(event.target)) {
                profileDropdown.classList.remove('open');
                profileToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

// Global Fonksiyonlar (HTML onclick için)
window.toggleSidebar = () => {
    const sidebar = document.querySelector('.app-sidebar');
    if (!sidebar) return;

    const isOpen = sidebar.classList.toggle('open');
    document.body.classList.toggle('sidebar-open', isOpen);
};

window.handleLogout = () => {
    auth.signOut().then(() => window.location.href = '/login.html');
};
