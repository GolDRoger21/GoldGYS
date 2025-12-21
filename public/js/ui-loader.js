import { auth } from "./firebase-config.js";
import { ensureUserDocument } from "./user-profile.js";
import { initNotificationContext } from "./notifications.js";
import { hydrateIconPlaceholders, renderIcon } from "./icon-library.js";

const FALLBACK_HTML = {
    header: `
        <div class="header-inner">
            <div class="header-left">
                <a href="/pages/dashboard.html" class="brand-mark header-brand" aria-label="Gold GYS panel ana sayfası">
                    <span class="brand-highlight">GOLD</span>GYS
                </a>
                <button class="mobile-menu-toggle" type="button" aria-label="Menüyü aç/kapat" data-mobile-nav-toggle>
                    <span class="icon" data-icon="menu"></span>
                </button>
                <div class="page-title-wrap" role="status">
                    <span id="pageTitle" class="page-title">Panelim</span>
                </div>
            </div>
            <div class="header-actions">
                <nav class="main-nav" aria-label="Ana navigasyon">
                    <a href="/pages/dashboard.html" data-page="dashboard"><span class="icon" data-icon="chart"></span>Panel</a>
                    <a href="/pages/konular.html" data-page="konular"><span class="icon" data-icon="book"></span>Ders Notları</a>
                    <a href="/pages/testler.html" data-page="testler"><span class="icon" data-icon="bolt"></span>Testler</a>
                    <a href="/pages/denemeler.html" data-page="denemeler"><span class="icon" data-icon="spark"></span>Denemeler</a>
                    <a href="/pages/yanlislarim.html" data-page="yanlislarim"><span class="icon" data-icon="shield"></span>Yanlışlarım</a>
                    <a class="admin-only" href="/pages/admin.html" data-page="admin" style="display:none;"><span class="icon" data-icon="bolt"></span>Yönetici</a>
                </nav>
                <div class="header-quick-actions" role="group" aria-label="Hızlı işlemler">
                    <button class="icon-button" type="button" aria-label="Tema değiştir" data-theme-toggle>
                        <span class="icon" data-theme-icon></span>
                    </button>
                    <button class="icon-button" type="button" aria-label="Bildirimler" data-notification-toggle>
                        <span class="icon" data-icon="bell" aria-hidden="true"></span>
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
                            <a href="/pages/profil.html"><span class="icon" data-icon="user"></span> Profilim</a>
                            <a href="/pages/profil.html"><span class="icon" data-icon="spark"></span> Ayarlar</a>
                            <a href="/pages/yardim.html"><span class="icon" data-icon="book"></span> Yardım</a>
                            <hr class="dropdown-separator" />
                            <button id="headerLogoutBtn" class="logout-btn" type="button"><span class="icon" data-icon="logout"></span> Çıkış Yap</button>
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
    adminHeader: `<div class="header-inner"><div class="header-left"><span class="page-title">Yönetim</span></div></div>`,
    adminFooter: `<div class="footer-shell"><div class="footer-meta"><span class="footer-copy">© 2025 GOLD GYS</span></div></div>`,
    authHeader: `<nav class="auth-nav"><a class="brand-mark" href="/">GOLDGYS</a></nav>`,
    authFooter: `<div class="auth-footer">© 2025 GOLD GYS</div>`,
    publicHeader: `<nav class="landing-nav"><a href="/" class="brand-mark">GOLDGYS</a></nav>`,
    publicFooter: `<footer><div class="copyright">© 2025 GOLD GYS</div></footer>`
};

const LAYOUT_COMPONENTS = {
    app: { header: '/components/header.html', footer: '/components/footer.html' },
    admin: { header: '/components/layouts/admin-header.html', footer: '/components/layouts/admin-footer.html', sidebar: '/partials/sidebar.html' },
    auth: { header: '/components/layouts/auth-header.html', footer: '/components/layouts/auth-footer.html' },
    public: { header: '/components/layouts/public-header.html', footer: '/components/layouts/public-footer.html' },
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
        applyTheme(theme);
    } catch (error) {
        applyTheme('light');
        console.warn('Tema tercihi okunamadı:', error);
    }
}

function applyTheme(theme) {
    const resolved = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.setProperty('color-scheme', resolved === 'dark' ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resolved } }));
}

function setupThemeToggle(headerEl) {
    const toggleButton = headerEl.querySelector('[data-theme-toggle]');
    const iconEl = headerEl.querySelector('[data-theme-icon]');
    const setIcon = (theme) => {
        if (iconEl) {
            const iconName = theme === 'dark' ? 'sun' : 'moon';
            iconEl.innerHTML = renderIcon(iconName, { size: 18, className: 'ui-icon' });
        }
    };

    const syncTheme = () => {
        const activeTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        setIcon(activeTheme);
    };

    syncTheme();

    toggleButton?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch (error) {
            console.warn('Tema tercihi kaydedilemedi:', error);
        }
        setIcon(next);
    });

    window.addEventListener('themechange', ({ detail }) => setIcon(detail?.theme));
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

    setupPrimaryNav(headerEl);
    setupThemeToggle(headerEl);
    setupProfileMenu(headerEl);

    const logoutBtn = headerEl.querySelector('#headerLogoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => window.handleLogout());
}

function setupPrimaryNav(headerEl) {
    const nav = headerEl.querySelector('.main-nav');
    const toggle = headerEl.querySelector('[data-mobile-nav-toggle]');

    if (!nav || !toggle) return;

    const closeNav = () => {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    };

    toggle.addEventListener('click', () => {
        const isOpen = nav.classList.toggle('open');
        toggle.setAttribute('aria-expanded', isOpen.toString());
    });

    nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', closeNav);
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) closeNav();
    });
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
    const { requireAuth = true, layout = 'app' } = options;
    const componentSet = LAYOUT_COMPONENTS[layout] || LAYOUT_COMPONENTS.app;

    applyStoredTheme();
    initNotificationContext();
    if (componentSet.sidebar) ensureSidebarOverlay();

    await Promise.all([
        componentSet.sidebar ? loadComponent('sidebar-area', componentSet.sidebar, 'sidebar') : null,
        loadComponent('header-area', componentSet.header, layout === 'admin' ? 'adminHeader' : 'header', (headerEl) => setupHeader(headerEl)),
        loadComponent('footer-area', componentSet.footer, layout === 'admin' ? 'adminFooter' : 'footer')
    ]);

    hydrateIconPlaceholders(document);

    if (pageKey) {
        document.querySelectorAll(`.sidebar-nav a[data-page="${pageKey}"], .sidebar-menu a[data-page="${pageKey}"]`)
            .forEach(link => link.classList.add('active'));
        document.querySelectorAll(`.main-nav a[data-page="${pageKey}"]`)
            .forEach(link => link.classList.add('active'));
    }

    const userNameEl = document.getElementById('headerUserName');
    const userEmailEl = document.getElementById('headerUserEmail');
    const userInitialEl = document.getElementById('headerUserInitial');
    const dropdownInitialEl = document.getElementById('dropdownUserInitial');

    auth.onAuthStateChanged(async user => {
        if (user) {
            if (userNameEl) userNameEl.innerText = 'Kullanıcı';

            const profile = await ensureUserDocument(user);

            let displayName = 'Kullanıcı';
            if (profile && (profile.name || profile.ad)) {
                displayName = `${profile.name || profile.ad} ${profile.surname || profile.soyad || ''}`.trim();
            } else if (user.displayName) {
                displayName = user.displayName;
            } else if (user.email) {
                displayName = user.email.split('@')[0];
            }

            const initial = displayName.charAt(0).toUpperCase();

            if (userNameEl) userNameEl.innerText = displayName;
            if (userEmailEl) userEmailEl.innerText = user.email || '';
            if (userInitialEl) userInitialEl.innerText = initial;
            if (dropdownInitialEl) dropdownInitialEl.innerText = initial;

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

function setupPublicNav(headerEl) {
    const navToggle = headerEl.querySelector('[data-public-nav-toggle]');
    const navLinks = headerEl.querySelector('#landingMenu');

    if (navToggle && navLinks) {
        navToggle.addEventListener('click', () => {
            const isOpen = navLinks.classList.toggle('open');
            navToggle.setAttribute('aria-expanded', isOpen.toString());
        });

        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
                navToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
}

export async function initPublicLayout() {
    applyStoredTheme();
    initNotificationContext();

    await Promise.all([
        loadComponent('public-header', LAYOUT_COMPONENTS.public.header, 'publicHeader', (headerEl) => {
            setupThemeToggle(headerEl);
            setupPublicNav(headerEl);
        }),
        loadComponent('public-footer', LAYOUT_COMPONENTS.public.footer, 'publicFooter')
    ]);

    hydrateIconPlaceholders(document);
}

export async function initAuthLayout() {
    applyStoredTheme();
    initNotificationContext();

    await Promise.all([
        loadComponent('auth-header', LAYOUT_COMPONENTS.auth.header, 'authHeader', (headerEl) => setupThemeToggle(headerEl)),
        loadComponent('auth-footer', LAYOUT_COMPONENTS.auth.footer, 'authFooter')
    ]);

    hydrateIconPlaceholders(document);
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
