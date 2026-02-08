
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';
import { showConfirm, showToast } from './notifications.js';
import { MaintenanceGuard } from './modules/maintenance-guard.js';
import { Router } from './modules/router.js';

// --- GLOBAL ERROR GUARDIAN ---
window.addEventListener('error', (event) => {
    console.error("Global Error Caught:", event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    console.warn("Unhandled Promise Rejection:", event.reason);
});

const PAGE_CONFIG = {
    '/': { id: 'home', title: 'Ana Sayfa', html: '/index.html' },
    '/index.html': { id: 'home', title: 'Ana Sayfa', html: '/index.html' },
    '/dashboard': { id: 'dashboard', title: 'Genel Bakış', script: '/js/dashboard.js', html: '/pages/dashboard.html' },
    '/pages/dashboard.html': { id: 'dashboard', title: 'Genel Bakış', script: '/js/dashboard.js', html: '/pages/dashboard.html' },
    '/admin/index.html': { id: 'admin', title: 'Yönetim Paneli', script: '/js/admin-page.js', html: '/admin/index.html' },
    '/profil': { id: 'profile', title: 'Profilim', script: '/js/profile-page.js', html: '/pages/profil.html' },
    '/pages/profil.html': { id: 'profile', title: 'Profilim', script: '/js/profile-page.js', html: '/pages/profil.html' },
    '/konular': { id: 'lessons', title: 'Dersler', script: '/js/pages/konular.js', html: '/pages/konular.html' },
    '/pages/konular.html': { id: 'lessons', title: 'Dersler', script: '/js/pages/konular.js', html: '/pages/konular.html' },
    '/konu': { id: 'lesson-detail', title: 'Konu Detay', script: '/js/pages/konu.js', html: '/pages/konu.html' },
    '/pages/konu.html': { id: 'lesson-detail', title: 'Konu Detay', script: '/js/pages/konu.js', html: '/pages/konu.html' },

    '/denemeler': { id: 'trials', title: 'Denemeler', script: '/js/pages/denemeler.js', html: '/pages/denemeler.html' },
    '/pages/denemeler.html': { id: 'trials', title: 'Denemeler', script: '/js/pages/denemeler.js', html: '/pages/denemeler.html' },
    '/deneme': { id: 'trial-detail', title: 'Deneme Çöz', script: '/js/pages/deneme.js', html: '/pages/deneme.html' },
    '/pages/deneme.html': { id: 'trial-detail', title: 'Deneme Çöz', script: '/js/pages/deneme.js', html: '/pages/deneme.html' },
    '/yanlislarim': { id: 'mistakes', title: 'Yanlışlarım', script: '/js/pages/yanlislarim.js', html: '/pages/yanlislarim.html' },
    '/pages/yanlislarim.html': { id: 'mistakes', title: 'Yanlışlarım', script: '/js/pages/yanlislarim.js', html: '/pages/yanlislarim.html' },
    '/favoriler': { id: 'favorites', title: 'Favoriler', script: '/js/pages/favoriler.js', html: '/pages/favoriler.html' },
    '/pages/favoriler.html': { id: 'favorites', title: 'Favoriler', script: '/js/pages/favoriler.js', html: '/pages/favoriler.html' },
    '/analiz': { id: 'analysis', title: 'Analiz', script: '/js/analysis.js', html: '/pages/analiz.html' },
    '/pages/analiz.html': { id: 'analysis', title: 'Analiz', script: '/js/analysis.js', html: '/pages/analiz.html' },
    '/admin': { id: 'admin', title: 'Yönetim Paneli', script: '/js/admin-page.js', html: '/admin/index.html' },
    '/admin/': { id: 'admin', title: 'Yönetim Paneli', script: '/js/admin-page.js', html: '/admin/index.html' }
};

const ROUTE_ALIASES = {
    '/yardim': { html: '/pages/yardim.html', layout: 'public', title: 'Yardım Merkezi' },
    '/gizlilik': { html: '/pages/gizlilik.html', layout: 'public', title: 'Gizlilik Politikası' },
    '/kullanim-sartlari': { html: '/pages/kullanim-sartlari.html', layout: 'public', title: 'Kullanım Şartları' },
    '/yasal': { html: '/pages/yasal.html', layout: 'app', title: 'Yasal Bilgilendirme' },
    '/pending-approval': { html: '/pages/pending-approval.html', layout: 'app', title: 'Onay Bekleniyor' },
    '/report': { html: '/pages/report.html', layout: 'app', title: 'Rapor' },
    '/test': { html: '/pages/test.html', layout: 'app', title: 'Test' },
    '/login': { html: '/login.html', layout: 'public', title: 'Giriş' },
    '/maintenance': { html: '/maintenance.html', layout: 'public', title: 'Bakım' },
    '/404': { html: '/404.html', layout: 'public', title: 'Sayfa Bulunamadı' }
};

const PUBLIC_ROUTES = [
    '/', '/login', '/login.html', '/maintenance', '/maintenance.html', '/404', '/404.html',
    '/yardim', '/pages/yardim.html', '/gizlilik', '/pages/gizlilik.html',
    '/kullanim-sartlari', '/pages/kullanim-sartlari.html'
];
const PUBLIC_LAYOUT_ROUTES = [
    '/', '/index.html',
    '/yardim', '/pages/yardim.html', '/gizlilik', '/pages/gizlilik.html',
    '/kullanim-sartlari', '/pages/kullanim-sartlari.html',
    '/maintenance', '/maintenance.html', '/404', '/404.html'
];

let layoutInitPromise = null;
const pageCache = new Map();
const pageFetches = new Map();
const PAGE_CACHE_PREFIX = 'cached_page_';
let currentLayoutType = null;

// Initialize Router
const router = new Router({
    routes: PAGE_CONFIG,
    aliases: ROUTE_ALIASES,
    baseTitle: 'Gold GYS',
    notFoundRoute: '/404'
});

const SCRIPT_VERSION_KEY = 'app_script_version';
const SCRIPT_VERSION = (() => {
    try {
        const existing = sessionStorage.getItem(SCRIPT_VERSION_KEY);
        if (existing) return existing;
        const created = `${Date.now()}`;
        sessionStorage.setItem(SCRIPT_VERSION_KEY, created);
        return created;
    } catch (e) {
        return `${Date.now()}`;
    }
})();

function withScriptVersion(scriptPath) {
    try {
        const url = new URL(scriptPath, window.location.origin);
        if (!url.searchParams.has('v')) url.searchParams.set('v', SCRIPT_VERSION);
        return url.toString();
    } catch { return scriptPath; }
}

function normalizePath(path) {
    const cleanPath = path.split('?')[0];
    if (cleanPath.length > 1 && cleanPath.endsWith('/')) return cleanPath.slice(0, -1);
    return cleanPath;
}

function getConfigForPath(path) {
    const normalizedPath = normalizePath(path);
    if (PAGE_CONFIG[normalizedPath]) return { config: PAGE_CONFIG[normalizedPath], normalizedPath };
    const segments = normalizedPath.split('/').filter(Boolean);
    if (segments.length > 1) {
        const basePath = `/${segments[0]}`;
        if (PAGE_CONFIG[basePath]) return { config: PAGE_CONFIG[basePath], normalizedPath: basePath };
    }
    return { config: null, normalizedPath };
}

function resolveContentUrl(path) {
    const { config } = getConfigForPath(path);
    if (config?.html) return config.html;
    const normalizedPath = normalizePath(path);
    const alias = ROUTE_ALIASES[normalizedPath];
    if (alias?.html) return alias.html;
    if (normalizedPath.startsWith('/admin')) return '/admin/index.html';
    if (normalizedPath === '/login') return '/login.html';
    if (normalizedPath === '/maintenance') return '/maintenance.html';
    if (normalizedPath === '/404') return '/404.html';
    return path;
}

export async function initLayout() {
    if (layoutInitPromise) return layoutInitPromise;

    layoutInitPromise = (async () => {
        const path = window.location.pathname;
        const normalizedPath = normalizePath(path);
        const isAdminPage = normalizedPath.includes('/admin');
        const usePublicLayout = PUBLIC_LAYOUT_ROUTES.includes(normalizedPath);
        currentLayoutType = usePublicLayout ? 'public' : (isAdminPage ? 'admin' : 'app');

        try {
            await MaintenanceGuard.check();

            // 1. Auth & Layout Setup
            const authState = await resolveAuthState(path);
            const shouldUsePublicLayout = usePublicLayout;

            if (authState.redirecting) {
                document.body.style.visibility = 'visible';
                return true;
            }

            await loadRequiredHTML(isAdminPage, shouldUsePublicLayout);
            updateLandingAuthButtons(!!authState.user);
            initThemeAndSidebar();

            if (authState.user) {
                updateUIWithUserData(authState.user, authState.profile, authState.hasPrivilege);
            }

            setupEventListeners();

            if (shouldUsePublicLayout) {
                setupLandingNav();
            }

            document.body.style.visibility = 'visible';

            // 2. Initialize Router & Navigate to current page
            router.onNavigate = handlePageLoad;

            // Set active menu item on navigation
            router.on('end', ({ path }) => {
                const { config } = getConfigForPath(path);
                if (config) setActiveMenuItem(config.id);
                // Mobil sidebar clean up
                document.body.classList.remove('mobile-sidebar-active');
            });

            await router.init();

            return true;

        } catch (error) {
            console.error('Arayüz Yükleme Kritik Hatası:', error);
            document.body.style.visibility = 'visible';
            renderErrorFallback(error);
            throw error;
        }
    })();

    return layoutInitPromise;
}

function renderErrorFallback(error) {
    const mainContent = document.getElementById('main-content') || document.body;
    mainContent.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; text-align:center; padding:20px;">
            <h2 style="color:var(--color-danger, #ef4444); margin-bottom:10px;">Bir şeyler ters gitti</h2>
            <p style="color:var(--text-muted, #94a3b8); margin-bottom:20px;">Sayfa yüklenirken beklenmeyen bir hata oluştu.</p>
            <button onclick="window.location.reload()" style="padding:10px 20px; background:var(--color-primary, #D4AF37); border:none; border-radius:6px; color:#000; font-weight:bold; cursor:pointer;">
                Sayfayı Yenile
            </button>
             <details style="margin-top:20px; color:var(--text-muted, #64748b); font-size:0.8rem; max-width:600px; text-align:left;">
                <summary>Hata Detayı</summary>
                <pre style="margin-top:10px; background:rgba(0,0,0,0.1); padding:10px; border-radius:4px; overflow:auto;">\${error.message}\\n\${error.stack}</pre>
            </details>
        </div>
    `;
}

// Handler for Router Navigation
async function handlePageLoad(routeConfig, path, signal) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    // Show Loading
    mainContent.innerHTML = '<div class="loading-spinner-container"><div class="loading-spinner"></div></div>';

    try {
        // 1. Load HTML Content
        const contentUrl = resolveContentUrl(path);
        const html = await fetchPageHTML(contentUrl, { signal });

        if (signal.aborted) return;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        syncPageStyles(doc, contentUrl);

        let content = doc.querySelector('.dashboard-container') || doc.querySelector('main') || doc.querySelector('#main-content');
        if (!content) content = doc.body;

        // Clean scripts from HTML to prevent auto-execution (we handle scripts manually)
        content.querySelectorAll('script').forEach(s => s.remove());

        if (content.tagName && content.tagName.toLowerCase() !== 'body') {
            mainContent.replaceChildren(content.cloneNode(true));
        } else {
            mainContent.innerHTML = content.innerHTML;
        }

        syncBodyClasses(doc);

        // 2. Load Script Module
        let cleanup = null;
        if (routeConfig.script) {
            const scriptUrl = withScriptVersion(routeConfig.script);
            console.log(`Script yükleniyor: ${scriptUrl}`);

            try {
                const module = await import(scriptUrl);

                if (signal.aborted) return;


                // Strict 'mount' interface
                if (module.mount) {
                    await module.mount(new URLSearchParams(window.location.search));
                    cleanup = module.unmount;
                } else {
                    throw new Error(`Module ${routeConfig.script} does not export 'mount' function.`);
                }

            } catch (scriptError) {
                console.error(`Script init hatası (${routeConfig.script}):`, scriptError);
                renderScriptError(scriptError);
            }
        }

        return { cleanup };

    } catch (e) {
        if (signal.aborted) return;
        console.error(`Failed to load content for ${path}:`, e);
        mainContent.innerHTML = '<div class="error-message">Sayfa içeriği yüklenemedi.</div>';
        throw e;
    }
}

async function loadRequiredHTML(isAdminPage, usePublicLayout = false) {
    if (window.location.pathname.startsWith('/test/')) return;

    if (usePublicLayout) {
        ensureLandingStyles(true);
        let publicHeader = document.querySelector('.landing-nav');
        if (!publicHeader) {
            publicHeader = document.createElement('nav');
            publicHeader.className = 'landing-nav';
            document.body.prepend(publicHeader);
        }
        await loadHTML('/partials/landing-header.html', publicHeader);
        return;
    }

    ensureLandingStyles(false);

    // Remove existing landing navigation if present (e.g. if SPA loaded from index.html)
    const existingLandingNav = document.querySelector('.landing-nav');
    if (existingLandingNav) existingLandingNav.remove();

    const headerUrl = isAdminPage ? '/partials/admin-header.html' : '/partials/header.html';
    const sidebarUrl = isAdminPage ? '/partials/admin-sidebar.html' : '/partials/sidebar.html';

    let headerContainer = document.getElementById('header-placeholder') || document.getElementById('app-header');
    if (!headerContainer) {
        createAppLayout();
        headerContainer = document.getElementById('app-header');
    }

    let sidebarContainer = document.getElementById('sidebar-placeholder') || document.getElementById('app-sidebar');

    if (!document.getElementById('sidebarOverlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebarOverlay';
        document.body.appendChild(overlay);
    }

    await Promise.all([
        loadHTML(headerUrl, headerContainer),
        loadHTML(sidebarUrl, sidebarContainer)
    ]);
}

function createAppLayout() {
    const layoutDiv = document.createElement('div');
    layoutDiv.className = 'app-layout';

    const header = document.createElement('header');
    header.className = 'app-header';
    header.id = 'app-header';

    const sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.id = 'app-sidebar';

    const main = document.createElement('main');
    main.className = 'app-main';
    main.id = 'main-content';

    while (document.body.firstChild) {
        main.appendChild(document.body.firstChild);
    }

    layoutDiv.appendChild(header);
    layoutDiv.appendChild(sidebar);
    layoutDiv.appendChild(main);
    document.body.appendChild(layoutDiv);
}

async function loadHTML(url, element) {
    if (!element) return;
    try {
        const cacheKey = `cached_html_\${url}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            element.innerHTML = cached;
            return;
        }
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        try { sessionStorage.setItem(cacheKey, html); } catch { }
        element.innerHTML = html;
    } catch (e) {
        console.error(`${url} yüklenemedi:`, e);
    }
}

function initThemeAndSidebar() {
    if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'dark');
    const storedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = storedTheme || (prefersLight ? 'light' : 'dark');

    if (document.documentElement.getAttribute('data-theme') !== theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme;
    }
    updateThemeIcon(theme);

    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        document.body.classList.add('sidebar-collapsed');
    }
}

function updateThemeIcon(theme) {
    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');
    if (sunIcon && moonIcon) {
        sunIcon.style.display = theme === 'dark' ? 'block' : 'none';
        moonIcon.style.display = theme === 'dark' ? 'none' : 'block';
    }
}

function setupEventListeners() {
    document.body.addEventListener('click', async (e) => {
        const target = e.target;

        const toggleBtn = target.closest('#sidebarToggle');
        if (toggleBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (window.innerWidth <= 768) {
                document.body.classList.toggle('mobile-sidebar-active');
            } else {
                document.body.classList.toggle('sidebar-collapsed');
                localStorage.setItem('sidebarCollapsed', document.body.classList.contains('sidebar-collapsed'));
            }
            return;
        }

        if (target.id === 'sidebarOverlay') {
            document.body.classList.remove('mobile-sidebar-active');
            return;
        }

        const userMenuToggle = target.closest('#userMenuToggle');
        if (userMenuToggle) {
            e.stopPropagation();
            const dropdown = document.getElementById('profileDropdown');
            if (dropdown) dropdown.classList.toggle('active');
            return;
        }

        const themeBtn = target.closest('#themeToggle');
        if (themeBtn) {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            document.documentElement.style.colorScheme = next;
            localStorage.setItem('theme', next);
            updateThemeIcon(next);
            return;
        }

        const logoutBtn = target.closest('#logoutButton');
        if (logoutBtn) {
            const shouldLogout = await showConfirm("Oturumunuzu kapatmak istediğinize emin misiniz?", {
                title: "Çıkış Onayı", confirmText: "Çıkış Yap", cancelText: "Vazgeç"
            });
            if (shouldLogout) {
                signOut(auth).then(() => window.location.href = '/login.html');
            }
            return;
        }

        const dropdown = document.getElementById('profileDropdown');
        if (dropdown && dropdown.classList.contains('active') && !target.closest('#profileDropdown')) {
            dropdown.classList.remove('active');
        }
    });
}

async function resolveAuthState(path) {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const profile = await getUserProfile(user.uid);
                    const tokenResult = await user.getIdTokenResult();
                    const isAdmin = tokenResult.claims.admin === true || profile?.role === 'admin';
                    resolve({ user, profile, hasPrivilege: isAdmin, redirecting: false });
                } catch {
                    resolve({ user, profile: null, hasPrivilege: false, redirecting: false });
                }
            } else {
                const normalizedPath = normalizePath(path);
                if (!PUBLIC_ROUTES.includes(normalizedPath)) {
                    window.location.href = '/login.html';
                    resolve({ user: null, profile: null, hasPrivilege: false, redirecting: true });
                } else {
                    resolve({ user: null, profile: null, hasPrivilege: false, redirecting: false });
                }
            }
        });
    });
}

function setupLandingNav() {
    const nav = document.querySelector('.landing-nav');
    const mobileToggle = document.getElementById('mobileNavToggle');
    const primaryNav = document.getElementById('primaryNav');

    if (nav) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 40) nav.classList.add('scrolled');
            else nav.classList.remove('scrolled');
        });
    }

    if (mobileToggle && primaryNav) {
        mobileToggle.addEventListener('click', () => {
            const isOpen = primaryNav.classList.toggle('open');
            mobileToggle.classList.toggle('open', isOpen);
            mobileToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        primaryNav.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                primaryNav.classList.remove('open');
                mobileToggle.classList.remove('open');
                mobileToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
}

function ensureLandingStyles(enable) {
    const existing = document.getElementById('landingStyles');
    if (enable) {
        if (existing) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/landing.css';
        link.id = 'landingStyles';
        document.head.appendChild(link);
    } else {
        if (existing) existing.remove();
    }
}

function updateUIWithUserData(user, profile, hasPrivilege) {
    const name = (profile?.ad && profile?.soyad) ? `${profile.ad} ${profile.soyad}` : (user.displayName || "Kullanıcı");
    const email = user.email;
    const photoURL = profile?.photoURL || user.photoURL;
    const initial = name.charAt(0).toUpperCase();

    const elements = {
        names: document.querySelectorAll('#dropdownUserName'),
        emails: document.querySelectorAll('#dropdownUserEmail'),
        initials: document.querySelectorAll('#headerAvatarInitial, #dropdownAvatarInitial'),
        images: document.querySelectorAll('#headerAvatarImg, #dropdownAvatarImg')
    };

    elements.names.forEach(el => el.textContent = name);
    elements.emails.forEach(el => el.textContent = email);

    if (photoURL) {
        elements.images.forEach(img => { img.src = photoURL; img.style.display = 'block'; });
        elements.initials.forEach(el => el.style.display = 'none');
    } else {
        elements.images.forEach(img => img.style.display = 'none');
        elements.initials.forEach(el => { el.textContent = initial; el.style.display = 'flex'; });
    }

    const adminLinks = document.querySelectorAll('.admin-only');
    adminLinks.forEach(link => link.style.display = hasPrivilege ? 'flex' : 'none');
}

function updateLandingAuthButtons(isLoggedIn) {
    const navBtn = document.getElementById('navLoginBtn');
    const navRegBtn = document.getElementById('navRegisterBtn');
    const mobLoginBtn = document.getElementById('mobileLoginBtn');
    const mobRegBtn = document.getElementById('mobileRegisterBtn');

    if (!navBtn && !mobLoginBtn) return;

    if (isLoggedIn) {
        if (navBtn) {
            navBtn.textContent = 'Panele Git';
            navBtn.href = '/dashboard';
            navBtn.classList.remove('btn-secondary');
            navBtn.classList.add('btn-primary');
        }
        if (navRegBtn) navRegBtn.style.display = 'none';

        if (mobLoginBtn) {
            mobLoginBtn.href = '/dashboard';
            mobLoginBtn.classList.add('text-success');
            mobLoginBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
            `;
        }
        if (mobRegBtn) mobRegBtn.style.display = 'none';
    } else {
        if (navBtn) {
            navBtn.textContent = 'Giriş Yap';
            navBtn.href = '/login.html?mode=login';
            navBtn.classList.add('btn-secondary');
            navBtn.classList.remove('btn-primary');
        }
        if (navRegBtn) navRegBtn.style.display = '';
        if (mobLoginBtn) {
            mobLoginBtn.href = '/login.html?mode=login';
            mobLoginBtn.classList.remove('text-success');
            mobLoginBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
            `;
        }
        if (mobRegBtn) mobRegBtn.style.display = '';
    }
}

function setActiveMenuItem(pageId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`.nav-item[data-page="${pageId}"], .nav-item[data-tab="${pageId}"]`);
    if (activeItem) activeItem.classList.add('active');
}

function renderScriptError(error) {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
        < div class= "error-boundary-container" style = "text-align:center; padding:40px;" >
            <div style="font-size:3rem; margin-bottom:20px;">⚠️</div>
            <h3>Bu modül yüklenemedi</h3>
            <p class="text-muted">Bağlantı sorunu veya teknik bir aksaklık oluştu.</p>
            <div style="margin-top:20px;">
                <button onclick="window.location.reload()" class="btn btn-primary">Sayfayı Yenile</button>
            </div>
             <details style="margin-top:20px; color:var(--text-muted); font-size:0.75rem; text-align:left; display:inline-block; max-width:100%;">
                <summary>Teknik Detay</summary>
                <div style="background:rgba(255,0,0,0.05); padding:10px; border-radius:4px; margin-top:5px;">
                    ${error.message || error}
                </div>
            </details>
        </div >
        `;
}

function getCacheKey(url) {
    return `${PAGE_CACHE_PREFIX}${url}`;
}

function getCachedPageHTML(url) {
    if (pageCache.has(url)) return pageCache.get(url);
    const cacheKey = getCacheKey(url);
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        pageCache.set(url, cached);
        return cached;
    }
    return null;
}

function setCachedPageHTML(url, html) {
    pageCache.set(url, html);
    try { sessionStorage.setItem(getCacheKey(url), html); } catch (e) { console.warn('Cache quota exceeded:', e); }
}

async function fetchPageHTML(url, { signal } = {}) {
    const cached = getCachedPageHTML(url);
    if (cached) return cached;
    if (pageFetches.has(url)) return pageFetches.get(url);

    const fetchPromise = (async () => {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        setCachedPageHTML(url, html);
        return html;
    })();

    pageFetches.set(url, fetchPromise);
    try { return await fetchPromise; } finally { pageFetches.delete(url); }
}

function syncPageStyles(doc, url) {
    const baseUrl = new URL(url, window.location.origin);
    const nextStyles = new Set();
    const headLinks = doc.querySelectorAll('link[rel="stylesheet"]');

    headLinks.forEach(link => {
        const href = link.getAttribute('href');
        if (!href) return;
        const resolvedHref = new URL(href, baseUrl).toString();
        nextStyles.add(resolvedHref);
        const existing = document.head.querySelector(`link[data-page-style="true"][href="${resolvedHref}"]`);
        if (existing) return;
        const newLink = document.createElement('link');
        newLink.rel = 'stylesheet';
        newLink.href = resolvedHref;
        newLink.dataset.pageStyle = 'true';
        document.head.appendChild(newLink);
    });

    document.querySelectorAll('link[data-page-style="true"]').forEach(existing => {
        const existingHref = existing.getAttribute('href');
        if (!nextStyles.has(existingHref)) existing.remove();
    });
}

function syncBodyClasses(doc) {
    if (!doc?.body) return;
    const preservedClasses = new Set(['sidebar-collapsed', 'mobile-sidebar-active']);
    const existingClasses = new Set(document.body.classList);
    const nextClasses = new Set(doc.body.classList);
    preservedClasses.forEach(cls => { if (existingClasses.has(cls)) nextClasses.add(cls); });
    document.body.className = Array.from(nextClasses).join(' ');
}
