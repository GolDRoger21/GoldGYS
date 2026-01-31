import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';
import { showConfirm } from './notifications.js';

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

let layoutInitPromise = null;

export async function initLayout() {
    if (layoutInitPromise) return layoutInitPromise;

    layoutInitPromise = (async () => {
        const path = window.location.pathname;
        const isAdminPage = path.includes('/admin');
        const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Gold GYS' };

        try {
            // 1. HTML Parçalarını Yükle
            await loadRequiredHTML(isAdminPage);

            // 2. Tema ve Sidebar Durumunu Yükle
            initThemeAndSidebar();

            // 3. Auth Kontrolü ve UI Güncelleme
            await checkUserAuthState();

            // 4. Event Listener'ları Bağla
            setupEventListeners();

            // 5. Aktif Menüyü İşaretle
            setActiveMenuItem(config.id);

            // 6. Sayfayı Göster
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

async function loadRequiredHTML(isAdminPage) {
    // Admin ve User için aynı header yapısını kullanıyoruz artık (tutarlılık için)
    // Ancak içerik farklı olabilir diye dosya isimlerini koruyoruz.
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
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        element.innerHTML = html;
    } catch (e) {
        console.error(`${url} yüklenemedi:`, e);
    }
}

function initThemeAndSidebar() {
    // Tema Kontrolü
    const savedTheme = localStorage.getItem('theme') || 'dark'; // Varsayılan Dark
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

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
                document.body.classList.toggle('sidebar-open');
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
            document.body.classList.remove('sidebar-open');
        }

        if (window.innerWidth <= 768 && target.closest('.app-sidebar a')) {
            document.body.classList.remove('sidebar-open');
        }
    });
}

async function checkUserAuthState() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const profile = await getUserProfile(user.uid);
                    const tokenResult = await user.getIdTokenResult();
                    const isAdmin = tokenResult.claims.admin === true || profile?.role === 'admin';
                    const isEditor = tokenResult.claims.editor === true || profile?.role === 'editor';

                    updateUIWithUserData(user, profile, isAdmin || isEditor);
                } catch (e) { console.error(e); }
            } else {
                // Public sayfalarda değilsek login'e at
                const isPublic = ['/login.html', '/', '/404.html'].includes(window.location.pathname);
                if (!isPublic) window.location.href = '/login.html';
            }
            resolve();
        });
    });
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

function setActiveMenuItem(pageId) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    // Hem data-page hem data-tab (admin için) kontrol et
    const activeItem = document.querySelector(`.nav-item[data-page="${pageId}"], .nav-item[data-tab="${pageId}"]`);
    if (activeItem) activeItem.classList.add('active');
}
