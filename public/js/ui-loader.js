import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';
import { showConfirm } from './notifications.js';
import { MaintenanceGuard } from './modules/maintenance-guard.js';

const PAGE_CONFIG = {
    '/dashboard': { id: 'dashboard', title: 'Genel Bakış' },
    '/pages/dashboard.html': { id: 'dashboard', title: 'Genel Bakış' },
    '/admin/index.html': { id: 'admin', title: 'Yönetim Paneli' },
    '/profil': { id: 'profile', title: 'Profilim' },
    '/pages/profil.html': { id: 'profile', title: 'Profilim' },
    '/konular': { id: 'lessons', title: 'Dersler' },
    '/pages/konular.html': { id: 'lessons', title: 'Dersler' },
    '/pages/testler.html': { id: 'tests', title: 'Testler' },
    '/denemeler': { id: 'trials', title: 'Denemeler' },
    '/pages/denemeler.html': { id: 'trials', title: 'Denemeler' },
    '/yanlislarim': { id: 'mistakes', title: 'Yanlışlarım' },
    '/pages/yanlislarim.html': { id: 'mistakes', title: 'Yanlışlarım' },
    '/favoriler': { id: 'favorites', title: 'Favoriler' },
    '/pages/favoriler.html': { id: 'favorites', title: 'Favoriler' },
    '/analiz': { id: 'analysis', title: 'Analiz' },
    '/pages/analiz.html': { id: 'analysis', title: 'Analiz' }
};

const PUBLIC_ROUTES = [
    '/',
    '/login.html',
    '/404.html',
    '/pages/yardim.html',
    '/pages/yardim',
    '/pages/gizlilik.html',
    '/pages/gizlilik',
    '/pages/kullanim-sartlari.html',
    '/pages/kullanim-sartlari'
];
const PUBLIC_LAYOUT_ROUTES = [
    '/pages/yardim.html',
    '/pages/yardim',
    '/pages/gizlilik.html',
    '/pages/gizlilik',
    '/pages/kullanim-sartlari.html',
    '/pages/kullanim-sartlari'
];

let layoutInitPromise = null;

export async function initLayout() {
    if (layoutInitPromise) return layoutInitPromise;

    layoutInitPromise = (async () => {
        const path = window.location.pathname;
        const isAdminPage = path.includes('/admin');
        const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Gold GYS' };
        const usePublicLayout = PUBLIC_LAYOUT_ROUTES.includes(path);

        try {
            // 0. Bakım Modu Kontrolü
            await MaintenanceGuard.check();

            // 1. Auth Durumunu Al
            const authState = await resolveAuthState(path);
            const shouldUsePublicLayout = usePublicLayout;

            if (authState.redirecting) {
                document.body.style.visibility = 'visible';
                return true;
            }

            // 2. HTML Parçalarını Yükle
            await loadRequiredHTML(isAdminPage, shouldUsePublicLayout);
            updateLandingAuthButtons(!!authState.user);

            // 3. Tema ve Sidebar Durumunu Yükle
            initThemeAndSidebar();

            // 4. UI Güncelleme
            if (authState.user) {
                updateUIWithUserData(authState.user, authState.profile, authState.hasPrivilege);
            }

            // 5. Event Listener'ları Bağla
            setupEventListeners();

            if (shouldUsePublicLayout) {
                setupLandingNav();
            } else {
                // 6. Aktif Menüyü İşaretle
                setActiveMenuItem(config.id);
            }

            // 7. Sayfayı Göster
            document.body.style.visibility = 'visible';
            document.title = `${config.title} | GOLD GYS`;

            return true;

        } catch (error) {
            console.error('Arayüz Yükleme Hatası:', error);
            document.body.style.visibility = 'visible'; // Hata olsa bile göster
            throw error;
        }
    })();

    return layoutInitPromise;
}

async function loadRequiredHTML(isAdminPage, usePublicLayout = false) {
    // Admin ve User için aynı header yapısını kullanıyoruz artık (tutarlılık için)
    // Ancak içerik farklı olabilir diye dosya isimlerini koruyoruz.

    // Distraction-Free Mode for Test Pages
    // Test sayfalarında header ve sidebar'ı yükleme
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

    const headerUrl = isAdminPage ? '/partials/admin-header.html' : '/partials/header.html';
    const sidebarUrl = isAdminPage ? '/partials/admin-sidebar.html' : '/partials/sidebar.html';

    // Header'ı nereye koyacağız?
    // Eğer sayfada #header-placeholder, #header-area veya #app-header varsa oraya, yoksa body'nin başına (app-layout yapısı için)
    let headerContainer = document.getElementById('header-placeholder')
        || document.getElementById('header-area')
        || document.getElementById('app-header');

    const appLayout = document.querySelector('.app-layout');
    if (!headerContainer) {
        // Eğer app-layout yapısı yoksa oluştur
        if (!appLayout) {
            const layoutDiv = document.createElement('div');
            layoutDiv.className = 'app-layout';

            // Mevcut içeriği layout içine taşı (main olarak)
            const mainContent = document.createElement('main');
            mainContent.className = 'app-main';
            mainContent.id = 'main-content';

            while (document.body.firstChild) {
                mainContent.appendChild(document.body.firstChild);
            }

            layoutDiv.appendChild(mainContent);
            document.body.appendChild(layoutDiv);
        }

        // Header container oluştur
        headerContainer = document.createElement('header');
        headerContainer.className = 'app-header';
        headerContainer.id = 'app-header';
        document.querySelector('.app-layout').prepend(headerContainer);
    } else {
        headerContainer.classList.add('app-header');
        headerContainer.id = headerContainer.id || 'app-header';
        const layoutRoot = document.querySelector('.app-layout');
        if (!layoutRoot) {
            const layoutDiv = document.createElement('div');
            layoutDiv.className = 'app-layout';
            const mainContent = document.createElement('main');
            mainContent.className = 'app-main';
            mainContent.id = 'main-content';
            while (document.body.firstChild) {
                mainContent.appendChild(document.body.firstChild);
            }
            layoutDiv.appendChild(mainContent);
            document.body.appendChild(layoutDiv);
        }

        const resolvedLayout = document.querySelector('.app-layout');
        if (headerContainer.parentElement !== resolvedLayout) {
            resolvedLayout.prepend(headerContainer);
        }
    }


    // Sidebar container oluştur
    let sidebarContainer = document.getElementById('sidebar-placeholder')
        || document.getElementById('sidebar-area')
        || document.getElementById('app-sidebar');
    if (!sidebarContainer) {
        sidebarContainer = document.createElement('aside');
        sidebarContainer.className = 'app-sidebar';
        sidebarContainer.id = 'app-sidebar';
        // Header'dan sonra ekle (Grid yapısına uygun)
        document.querySelector('.app-layout').insertBefore(sidebarContainer, document.querySelector('.app-main'));
    } else {
        sidebarContainer.classList.add('app-sidebar');
        sidebarContainer.id = sidebarContainer.id || 'app-sidebar';
        const layoutRoot = document.querySelector('.app-layout');
        if (layoutRoot && sidebarContainer.parentElement !== layoutRoot) {
            layoutRoot.insertBefore(sidebarContainer, document.querySelector('.app-main'));
        }
    }

    // Mobil overlay ekle
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

async function loadHTML(url, element) {
    try {
        // Cache kontrolü (SessionStorage)
        const cacheKey = `cached_html_${url}`;
        const cached = sessionStorage.getItem(cacheKey);

        if (cached) {
            element.innerHTML = cached;
            return;
        }

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();

        // Cache'e kaydet
        try {
            sessionStorage.setItem(cacheKey, html);
        } catch (e) {
            console.warn('Cache quota exceeded:', e);
        }

        element.innerHTML = html;
    } catch (e) {
        console.error(`${url} yüklenemedi:`, e);
    }
}

function initThemeAndSidebar() {
    // Tema Kontrolü - theme-init.js ile birebir aynı mantık
    const storedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = storedTheme || (prefersLight ? 'light' : 'dark');

    // Gereksiz DOM güncellemesini önle
    if (document.documentElement.getAttribute('data-theme') !== theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.style.colorScheme = theme;
    }

    updateThemeIcon(theme);

    // Sidebar Kontrolü (Desktop için collapsed durumu)
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (isCollapsed) {
        document.body.classList.add('sidebar-collapsed');
    }
}

function updateThemeIcon(theme) {
    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');
    if (sunIcon && moonIcon) {
        if (theme === 'dark') {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
    }
}

function setupEventListeners() {
    // Event Delegation: Dinamik yüklenen elementler için body'ye listener ekliyoruz
    document.body.addEventListener('click', async (e) => {
        const target = e.target;

        // 1. Sidebar Toggle (Hamburger)
        const toggleBtn = target.closest('#sidebarToggle');
        if (toggleBtn) {
            e.stopPropagation();
            if (window.innerWidth <= 768) {
                document.body.classList.toggle('mobile-sidebar-active');
            } else {
                document.body.classList.toggle('sidebar-collapsed');
                localStorage.setItem('sidebarCollapsed', document.body.classList.contains('sidebar-collapsed'));
            }
            return;
        }

        // 2. Profil Menüsü Toggle
        const userMenuToggle = target.closest('#userMenuToggle');
        if (userMenuToggle) {
            e.stopPropagation();
            const dropdown = document.getElementById('profileDropdown');
            if (dropdown) {
                dropdown.classList.toggle('active');
            }
            return;
        }

        // 3. Tema Toggle
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

        // Bildirim Dropdown Toggle (Admin dışında basit toggle)
        const notificationBtn = target.closest('#notificationBtn');
        if (notificationBtn && !document.body.classList.contains('admin-body')) {
            e.stopPropagation();
            const notificationDropdown = document.getElementById('notificationDropdown');
            if (notificationDropdown) {
                notificationDropdown.classList.toggle('active');
                document.getElementById('profileDropdown')?.classList.remove('active');

                // Eğer içerik "Yükleniyor..." ise ve admin değilse boş durumu göster
                const list = document.getElementById('notificationList');
                if (list && list.innerText.includes("Yükleniyor...")) {
                    list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Henüz yeni bildirim yok.</div>';
                    const badge = document.getElementById('notificationBadge');
                    if (badge) {
                        badge.style.display = 'none';
                    }
                }
            }
            return;
        }

        // 4. Çıkış Butonu
        const logoutBtn = target.closest('#logoutButton');
        if (logoutBtn) {
            const shouldLogout = await showConfirm("Oturumunuzu kapatmak istediğinize emin misiniz?", {
                title: "Çıkış Onayı",
                confirmText: "Çıkış Yap",
                cancelText: "Vazgeç"
            });
            if (shouldLogout) {
                signOut(auth).then(() => window.location.href = '/login.html');
            }
            return;
        }

        // 5. Dışarı Tıklama (Menüleri Kapat)
        const dropdown = document.getElementById('profileDropdown');
        if (dropdown && dropdown.classList.contains('active') && !target.closest('#profileDropdown')) {
            dropdown.classList.remove('active');
        }

        if (!document.body.classList.contains('admin-body')) {
            const notificationDropdown = document.getElementById('notificationDropdown');
            if (notificationDropdown && notificationDropdown.classList.contains('active') && !target.closest('#notificationDropdown')) {
                notificationDropdown.classList.remove('active');
            }
        }

        // Mobil Sidebar Overlay Tıklama
        if (target.id === 'sidebarOverlay') {
            document.body.classList.remove('mobile-sidebar-active');
        }

        if (window.innerWidth <= 768 && target.closest('.app-sidebar a')) {
            document.body.classList.remove('mobile-sidebar-active');
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
                    const isEditor = tokenResult.claims.editor === true || profile?.role === 'editor';

                    resolve({
                        user,
                        profile,
                        hasPrivilege: isAdmin || isEditor,
                        redirecting: false
                    });
                } catch (e) {
                    console.error(e);
                    resolve({
                        user,
                        profile: null,
                        hasPrivilege: false,
                        redirecting: false
                    });
                }
            } else {
                if (!PUBLIC_ROUTES.includes(path)) {
                    window.location.href = '/login.html';
                    resolve({ user: null, profile: null, hasPrivilege: false, redirecting: true });
                    return;
                }

                resolve({ user: null, profile: null, hasPrivilege: false, redirecting: false });
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
            if (window.scrollY > 40) {
                nav.classList.add('scrolled');
            } else {
                nav.classList.remove('scrolled');
            }
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
        const existingLink = document.querySelector('link[href="/css/landing.css"]');
        if (existingLink) {
            if (!existingLink.id) existingLink.id = 'landingStyles';
            return;
        }
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/css/landing.css';
        link.id = 'landingStyles';
        document.head.appendChild(link);
        return;
    }

    if (existing) {
        existing.remove();
    }
}

function updateUIWithUserData(user, profile, hasPrivilege) {
    const name = (profile?.ad && profile?.soyad) ? `${profile.ad} ${profile.soyad}` : (user.displayName || "Kullanıcı");
    const email = user.email;
    const photoURL = profile?.photoURL || user.photoURL;
    const initial = name.charAt(0).toUpperCase();

    // Header ve Dropdown'daki alanları güncelle
    const elements = {
        names: document.querySelectorAll('#dropdownUserName'),
        emails: document.querySelectorAll('#dropdownUserEmail'),
        initials: document.querySelectorAll('#headerAvatarInitial, #dropdownAvatarInitial'),
        images: document.querySelectorAll('#headerAvatarImg, #dropdownAvatarImg')
    };

    elements.names.forEach(el => el.textContent = name);
    elements.emails.forEach(el => el.textContent = email);

    if (photoURL) {
        elements.images.forEach(img => {
            img.src = photoURL;
            img.style.display = 'block';
        });
        elements.initials.forEach(el => el.style.display = 'none');
    } else {
        elements.images.forEach(img => img.style.display = 'none');
        elements.initials.forEach(el => {
            el.textContent = initial;
            el.style.display = 'flex';
        });
    }

    // Admin/Editör Menülerini Göster/Gizle
    const adminLinks = document.querySelectorAll('.admin-only');
    adminLinks.forEach(link => {
        link.style.display = hasPrivilege ? 'flex' : 'none';
    });
}

function updateLandingAuthButtons(isLoggedIn) {
    const navBtn = document.getElementById('navLoginBtn');
    const navRegBtn = document.getElementById('navRegisterBtn');
    const mobLoginBtn = document.getElementById('mobileLoginBtn');
    const mobRegBtn = document.getElementById('mobileRegisterBtn');

    if (!navBtn && !navRegBtn && !mobLoginBtn && !mobRegBtn) return;

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
            navBtn.classList.remove('btn-primary');
            navBtn.classList.add('btn-secondary');
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

    // Hem data-page hem data-tab (admin için) kontrol et
    const activeItem = document.querySelector(`.nav-item[data-page="${pageId}"], .nav-item[data-tab="${pageId}"]`);
    if (activeItem) activeItem.classList.add('active');
}
