import { auth } from "./firebase-config.js";
import { ensureUserDocument } from "./user-profile.js";

const FALLBACK_HTML = {
    sidebar: `
        <div class="sidebar-logo">
            <a href="/pages/dashboard.html" class="brand-mark brand-on-dark brand-compact" aria-label="Gold GYS paneline dön">
                <span class="brand-highlight">GOLD</span>GYS ⚖️
            </a>
        </div>
        <nav class="sidebar-menu sidebar-nav">
            <ul>
                <li><a href="/pages/dashboard.html" data-page="dashboard"><span class="icon">📊</span> Panelim</a></li>
                <li><a href="/pages/konular.html" data-page="konular"><span class="icon">📚</span> Ders Notları</a></li>
                <li><a href="/pages/testler.html" data-page="testler"><span class="icon">📝</span> Konu Testleri</a></li>
                <li><a href="/pages/denemeler.html" data-page="denemeler"><span class="icon">🏆</span> Denemeler</a></li>
                <li><a href="/pages/yanlislarim.html" data-page="yanlislarim"><span class="icon">⚠️</span> Yanlışlarım</a></li>
                <li class="editor-only" style="display:none; margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
                    <a href="/pages/konular.html" data-page="editor"><span class="icon">✍️</span> Editör Araçları</a>
                </li>
                <li class="admin-only" style="display:none;"><a href="/pages/admin.html" data-page="admin"><span class="icon">⚙️</span> Yönetici Paneli</a></li>
            </ul>
        </nav>
        <div class="sidebar-footer">
            <button id="btnLogout" onclick="window.handleLogout()">
                <span class="icon">🚪</span> Çıkış Yap
            </button>
        </div>
    `,
    header: `
        <div class="header-inner">
            <div class="header-left">
                <button class="mobile-menu-toggle" type="button" aria-label="Yan menüyü aç/kapat" data-sidebar-toggle>☰</button>
                <a href="/pages/dashboard.html" class="brand-mark header-brand" aria-label="Gold GYS panel ana sayfası">
                    <span class="brand-highlight">GOLD</span>GYS
                </a>
                <div class="page-title-wrap">
                    <span id="pageTitle" class="page-title">Panelim</span>
                </div>
            </div>
            <div class="header-actions">
                <nav class="main-nav" aria-label="Ana navigasyon">
                    <a href="/pages/dashboard.html" data-page="dashboard">Panel</a>
                    <a href="/pages/testler.html" data-page="testler">Testler</a>
                    <a href="/pages/denemeler.html" data-page="denemeler">Denemeler</a>
                </nav>
                <div class="header-quick-actions" role="group" aria-label="Hızlı işlemler">
                    <button class="icon-button" type="button" aria-label="Tema değiştir" data-theme-toggle>
                        <span class="icon" data-theme-icon>🌙</span>
                    </button>
                    <button class="icon-button" type="button" aria-label="Bildirimler" data-notification-toggle>
                        <span aria-hidden="true">🔔</span>
                        <span class="badge-dot" data-notification-dot></span>
                    </button>
                    <div class="user-menu-container" data-profile-menu>
                        <button class="user-avatar-circle" id="headerAvatar" type="button" aria-label="Profil Menüsü" data-profile-toggle aria-expanded="false">
                            <span id="headerUserInitial">?</span>
                        </button>
                        <div class="profile-dropdown" id="profileDropdown" role="menu">
                            <div class="dropdown-header-info">
                                <div class="user-avatar-small" aria-hidden="true">
                                    <span id="dropdownUserInitial">?</span>
                                </div>
                                <div class="user-meta-text">
                                    <span class="user-name" id="headerUserName">Yükleniyor...</span>
                                    <span class="user-email" id="headerUserEmail">...</span>
                                </div>
                            </div>
                            <hr class="dropdown-separator" />
                            <a href="/pages/profil.html"><span>👤</span> Profilim</a>
                            <a href="/pages/profil.html"><span>⚙️</span> Ayarlar</a>
                            <a href="/pages/yardim.html"><span>❓</span> Yardım</a>
                            <hr class="dropdown-separator" />
                            <button id="headerLogoutBtn" class="logout-btn" type="button"><span>🚪</span> Çıkış Yap</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,
    footer: `
        <div class="footer-shell">
            <div class="footer-links-grid">
                <div class="footer-group">
                    <p class="footer-label">Panel</p>
                    <a href="/pages/dashboard.html">Panel</a>
                    <a href="/pages/testler.html">Testler</a>
                    <a href="/pages/denemeler.html">Denemeler</a>
                </div>
                <div class="footer-group">
                    <p class="footer-label">Hızlı Erişim</p>
                    <a href="/pages/konular.html">Ders Notları</a>
                    <a href="/pages/favoriler.html">Favorilerim</a>
                    <a href="/pages/yanlislarim.html">Yanlışlarım</a>
                </div>
                <div class="footer-group">
                    <p class="footer-label">Destek</p>
                    <a href="/pages/yardim.html">Yardım Merkezi</a>
                    <a href="/pages/yasal.html">Kullanım Şartları</a>
                    <a href="/pages/profil.html">Hesap</a>
                </div>
            </div>
            <div class="footer-meta">
                <span class="footer-copy">© 2025 GOLD GYS</span>
                <span class="footer-separator" aria-hidden="true">•</span>
                <span class="footer-credit">Gol D. Roger ile üretildi</span>
            </div>
        </div>
    `,
};

const COMPONENT_PATHS = {
    header: '/components/header.html',
    footer: '/components/footer.html',
    sidebar: '/partials/sidebar.html',
};

const THEME_STORAGE_KEY = 'gg-theme';

async function loadComponent(elementId, filePath, fallbackKey, afterLoad) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let html = null;

    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        html = await response.text();
    } catch (error) {
        console.error("Component yüklenemedi:", filePath, error);
        if (fallbackKey && FALLBACK_HTML[fallbackKey]) {
            html = FALLBACK_HTML[fallbackKey];
        }
    }

    if (html) {
        element.innerHTML = html;
        if (typeof afterLoad === "function") afterLoad(element);
    }
}

function applyStoredTheme() {
    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        const theme = stored === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
    } catch (error) {
        document.documentElement.setAttribute('data-theme', 'light');
        console.warn('Tema tercihi okunamadı:', error);
    }
}

function setupThemeToggle(headerEl) {
    const toggleButton = headerEl.querySelector('[data-theme-toggle]');
    const iconEl = headerEl.querySelector('[data-theme-icon]');
    const setIcon = (theme) => {
        if (iconEl) iconEl.textContent = theme === 'dark' ? '☀️' : '🌙';
    };

    const syncTheme = () => {
        const activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        setIcon(activeTheme);
    };

    syncTheme();

    toggleButton?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch (error) {
            console.warn('Tema tercihi kaydedilemedi:', error);
        }
        setIcon(next);
    });
}

function setupProfileMenu(headerEl) {
    const profileToggle = headerEl.querySelector('[data-profile-toggle]');
    const profileDropdown = headerEl.querySelector('#profileDropdown');
    const profileMenuContainer = headerEl.querySelector('[data-profile-menu]');

    if (profileToggle && profileDropdown && profileMenuContainer) {
        profileToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = profileDropdown.classList.contains('open');

            profileDropdown.classList.toggle('open', !isOpen);
            profileToggle.setAttribute('aria-expanded', (!isOpen).toString());
        });

        document.addEventListener('click', (event) => {
            if (!profileMenuContainer.contains(event.target)) {
                profileDropdown.classList.remove('open');
                profileToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

function setupHeader(headerEl) {
    const titleAttr = document.body?.dataset?.pageTitle;
    if (titleAttr) {
        const pageTitleEl = headerEl.querySelector('#pageTitle');
        if (pageTitleEl) pageTitleEl.innerText = titleAttr;
    }

    headerEl.querySelector('[data-sidebar-toggle]')?.addEventListener('click', () => toggleSidebar());
    setupThemeToggle(headerEl);
    setupProfileMenu(headerEl);

    const logoutBtn = headerEl.querySelector('#headerLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => window.handleLogout());
}

function ensureSidebarOverlay() {
    let overlay = document.querySelector('[data-sidebar-overlay]');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.setAttribute('data-sidebar-overlay', '');
        overlay.addEventListener('click', () => closeSidebar());
        document.body.appendChild(overlay);
    }
    return overlay;
}

function setSidebarState(isOpen) {
    const sidebar = document.querySelector('.app-sidebar');
    const overlay = ensureSidebarOverlay();
    if (!sidebar) return;

    sidebar.classList.toggle('open', isOpen);
    document.body.classList.toggle('sidebar-open', isOpen);
    overlay.classList.toggle('visible', isOpen);
}

export async function initLayout(pageKey, options = {}) {
    const { requireAuth = true } = options;
    applyStoredTheme();
    ensureSidebarOverlay();
    // 1. Sidebar ve Header'ı Yükle
    await Promise.all([
        loadComponent('sidebar-area', COMPONENT_PATHS.sidebar, 'sidebar'),
        loadComponent('header-area', COMPONENT_PATHS.header, 'header', (headerEl) => setupHeader(headerEl)),
        loadComponent('footer-area', COMPONENT_PATHS.footer, 'footer')
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

}

// Global Fonksiyonlar (HTML onclick için)
window.toggleSidebar = () => {
    const sidebar = document.querySelector('.app-sidebar');
    const isOpen = sidebar?.classList.contains('open');
    setSidebarState(!isOpen);
};

window.closeSidebar = () => setSidebarState(false);

window.handleLogout = () => {
    auth.signOut().then(() => window.location.href = '/login.html');
};
