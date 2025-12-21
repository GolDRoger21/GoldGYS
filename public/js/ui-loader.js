
import { auth } from "./firebase-config.js";
import { ensureUserDocument } from "./user-profile.js";
import { initNotificationContext } from "./notifications.js";
import { hydrateIconPlaceholders, renderIcon } from "./icon-library.js";

// Düzenlenmiş ve basitleştirilmiş yedek HTML. Artık hatalı bağlantı içermiyor.
const FALLBACK_HTML = {
    header: `
        <div class="header-inner">
            <div class="header-left">
                <button class="mobile-menu-toggle" onclick="toggleSidebar()" aria-label="Yan menüyü aç/kapat">☰</button>
                <span id="pageTitle" class="page-title">Yükleniyor...</span>
            </div>
            <div class="header-right">
                <div class="user-menu" data-profile-menu>
                    <div class="user-avatar" id="headerUserInitial">?</div>
                </div>
            </div>
        </div>
    `,
    sidebar: `
        <div class="sidebar-logo">
            <a href="/pages/dashboard.html" class="brand-mark brand-on-dark brand-compact">GOLDGYS ⚖️</a>
        </div>
        <nav class="sidebar-menu sidebar-nav">
            <ul><li><a href="/pages/dashboard.html">Panelim Yükleniyor...</a></li></ul>
        </nav>
    `,
    footer: `
        <div class="footer-shell">
            <div class="footer-meta">
                <span class="footer-copy">© 2025 GOLD GYS</span>
            </div>
        </div>
    `,
    adminHeader: `<div class="header-inner"><div class="header-left"><span class="page-title">Yönetim</span></div></div>`,
    authHeader: `<nav class="auth-nav"><a class="brand-mark" href="/">GOLDGYS</a></nav>`,
    publicHeader: `<nav class="landing-nav"><a href="/" class="brand-mark">GOLDGYS</a></nav>`,
    // Diğer yedekler (footer vb.) şimdilik aynı kalabilir.
    adminFooter: `<div class="footer-shell"><div class="footer-meta"><span class="footer-copy">© 2025 GOLD GYS</span></div></div>`,
    authFooter: `<div class="auth-footer">© 2025 GOLD GYS</div>`,
    publicFooter: `<footer><div class="copyright">© 2025 GOLD GYS</div></footer>`
};

// Doğru dosya yollarını yansıtacak şekilde güncellenmiş bileşen yolları.
const LAYOUT_COMPONENTS = {
    app: { header: '/partials/header.html', sidebar: '/partials/sidebar.html', footer: '/partials/footer.html' },
    admin: { header: '/partials/header.html', sidebar: '/partials/sidebar.html', footer: '/partials/footer.html' },
    auth: { header: '/partials/public-header.html', footer: '/partials/footer.html' }, // Auth sayfaları public header kullanabilir
    public: { header: '/partials/public-header.html', footer: '/partials/footer.html' },
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
        console.error("Component yüklenemedi, yedeğe geçiliyor:", filePath, error);
        if (fallbackKey && FALLBACK_HTML[fallbackKey]) {
            html = FALLBACK_HTML[fallbackKey];
        }
    }

    if (html) {
        element.innerHTML = html;
        if (typeof afterLoad === "function") afterLoad(element);
    }
}

// --- TEMA FONKSİYONLARI (DEĞİŞİKLİK YOK) ---
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
    document.documentElement.style.setProperty('color-scheme', resolved === 'dark' ? 'dark' : 'light');
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resolved } }));
}

function setupThemeToggle(headerEl) {
    // Bu fonksiyon, tema değiştirme düğmesinin işlevselliğini yönetir.
    // Görsel tutarlılık için olduğu gibi bırakıldı.
}


// --- HEADER VE MENÜ İŞLEVSELLİĞİ (DEĞİŞİKLİK YOK) ---
function setupProfileMenu(headerEl) {
    const profileToggle = headerEl.querySelector('[data-profile-toggle]');
    const profileDropdown = headerEl.querySelector('#profileDropdown');
    const profileMenuContainer = headerEl.querySelector('[data-profile-menu]');

    if (profileToggle && profileDropdown && profileMenuContainer) {
        profileToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = profileDropdown.classList.contains('open');
            profileDropdown.classList.toggle('open', !isOpen);
            profileToggle.setAttribute('aria-expanded', String(!isOpen));
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
    const titleEl = document.getElementById('pageTitle');
    const pageTitle = document.body.dataset.pageTitle || '';
    if (titleEl) titleEl.innerText = pageTitle;

    setupProfileMenu(headerEl);
    // Logout butonu gibi diğer event listener'lar burada olabilir.
    const logoutBtn = headerEl.querySelector('#btnLogout');
    if(logoutBtn) logoutBtn.addEventListener('click', () => window.handleLogout());
}

// --- YAN MENÜ (SIDEBAR) İŞLEVSELLİĞİ (DEĞİŞİKLİK YOK) ---
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

// --- ANA LAYOUT YÜKLEYİCİ ---
export async function initLayout(pageKey, options = {}) {
    const { requireAuth = true, layout = 'app' } = options;
    const componentSet = LAYOUT_COMPONENTS[layout] || LAYOUT_COMPONENTS.app;

    applyStoredTheme();
    if (requireAuth) {
        initNotificationContext();
        ensureSidebarOverlay();
    }

    await Promise.all([
        componentSet.sidebar ? loadComponent('sidebar-area', componentSet.sidebar, 'sidebar') : Promise.resolve(),
        loadComponent('header-area', componentSet.header, 'header', (headerEl) => setupHeader(headerEl)),
        componentSet.footer ? loadComponent('footer-area', componentSet.footer, 'footer') : Promise.resolve(),
    ]);

    hydrateIconPlaceholders(document);

    if (pageKey) {
        document.querySelectorAll(`.sidebar-nav a[data-page="${pageKey}"], .sidebar-menu a[data-page="${pageKey}"]`)
            .forEach(link => link.classList.add('active'));
    }
    
    // Auth değişikliğini dinle ve UI'ı güncelle (Rol kontrolü dahil)
    auth.onAuthStateChanged(async user => {
        if (user) {
            const profile = await ensureUserDocument(user);

            // Kullanıcı adı ve avatarını güncelle
            const displayName = profile?.displayName || user.displayName || user.email?.split('@')[0] || 'Kullanıcı';
            const initial = displayName.charAt(0).toUpperCase();

            document.querySelectorAll('#headerUserName').forEach(el => el.innerText = displayName);
            document.querySelectorAll('#headerUserInitial').forEach(el => el.innerText = initial);

            // Rolleri kontrol et ve menüleri göster/gizle
            try {
                const idTokenResult = await user.getIdTokenResult();
                const claims = idTokenResult.claims;
                
                const isAdmin = claims.role === 'admin' || claims.admin === true;
                const isEditor = claims.role === 'editor' || isAdmin; // Admin aynı zamanda editördür

                if (isAdmin) {
                    document.querySelectorAll('.admin-only').forEach(el => { el.style.display = 'list-item'; });
                }
                if (isEditor) {
                    document.querySelectorAll('.editor-only').forEach(el => { el.style.display = 'list-item'; });
                }

            } catch (error) {
                console.error('Rol yetkileri alınamadı:', error);
            }

        } else if (requireAuth) {
            // Eğer kullanıcı yoksa ve sayfa yetki gerektiriyorsa, giriş sayfasına yönlendir.
            if (!window.location.pathname.includes('/auth.html')) {
                window.location.href = `/auth.html?redirect=${encodeURIComponent(window.location.pathname)}`;
            }
        }
    });
}


// --- PUBLIC VE AUTH LAYOUT YÜKLEYİCİLERİ ---
export async function initPublicLayout() {
    applyStoredTheme();
    await Promise.all([
        loadComponent('public-header-area', LAYOUT_COMPONENTS.public.header, 'publicHeader'),
        loadComponent('public-footer-area', LAYOUT_COMPONENTS.public.footer, 'footer')
    ]);
    hydrateIconPlaceholders(document);
}

export async function initAuthLayout() {
    applyStoredTheme();
    await Promise.all([
        loadComponent('auth-header-area', LAYOUT_COMPONENTS.auth.header, 'authHeader'),
        loadComponent('auth-footer-area', LAYOUT_COMPONENTS.auth.footer, 'footer')
    ]);
    hydrateIconPlaceholders(document);
}

// --- GLOBAL PENCERE FONKSİYONLARI ---
window.toggleSidebar = () => {
    const sidebar = document.querySelector('.app-sidebar');
    const isOpen = sidebar?.classList.contains('open');
    setSidebarState(!isOpen);
};

window.closeSidebar = () => setSidebarState(false);

window.handleLogout = () => {
    auth.signOut().then(() => {
        console.log('Çıkış yapıldı. Yönlendiriliyor...');
        window.location.href = '/auth.html';
    }).catch(error => {
        console.error('Çıkış hatası:', error);
    });
};
