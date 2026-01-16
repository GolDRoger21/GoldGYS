import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

// Sayfa Başlık ve ID Ayarları
const PAGE_CONFIG = {
    '/pages/dashboard.html': { id: 'dashboard', title: 'Genel Bakış' },
    '/admin/index.html': { id: 'admin', title: 'Yönetim Paneli' },
    '/admin/importer.html': { id: 'importer', title: 'Veri Aktarımı' },
    '/pages/profil.html': { id: 'profile', title: 'Profilim' },
    '/pages/konular.html': { id: 'lessons', title: 'Dersler & Konular' },
    '/pages/testler.html': { id: 'tests', title: 'Testler' },
    '/pages/denemeler.html': { id: 'trials', title: 'Denemeler' },
    '/pages/deneme.html': { id: 'trials', title: 'Deneme Sınavı' },
    '/pages/test.html': { id: 'tests', title: 'Test Çöz' },
    '/pages/analiz.html': { id: 'analysis', title: 'Analiz Raporu' },
    '/pages/report.html': { id: 'analysis', title: 'Raporlar' },
    '/pages/yanlislarim.html': { id: 'mistakes', title: 'Yanlışlarım' },
    '/pages/favoriler.html': { id: 'favorites', title: 'Favoriler' },
    '/pages/konu.html': { id: 'lessons', title: 'Konu Detayı' },
    '/pages/yardim.html': { id: 'help', title: 'Yardım Merkezi' },
    '/pages/yasal.html': { id: 'help', title: 'Yasal Bilgilendirme' },
    '/pages/pending-approval.html': { id: 'unknown', title: 'Onay Bekleniyor' },
    '/pages/404.html': { id: 'unknown', title: 'Sayfa Bulunamadı' },
};

let layoutInitPromise = null;

/**
 * Tüm sayfa düzenini (Header, Sidebar, Auth) başlatan ana fonksiyon.
 */
export async function initLayout() {
    if (layoutInitPromise) return layoutInitPromise;

    layoutInitPromise = (async () => {
        // URL Normalizasyonu
        let path = window.location.pathname;
        if (!path.endsWith('.html') && !path.endsWith('/')) {
            path += '.html';
        }
        if (path === '/.html' || path === '/index.html') path = '/index.html';

        const isAdminPage = path.includes('/admin');
        const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Gold GYS' };

        console.log(`📍 Sayfa Yükleniyor: ${path} (ID: ${config.id})`);

        try {
            // 1. TEMA VE LAYOUT AYARI (Kritik)
            // Admin panelindeysek body'e 'admin-layout' sınıfını ekle
            if (isAdminPage) {
                document.body.classList.add('admin-layout');
            } else {
                document.body.classList.remove('admin-layout');
            }

            // 2. HTML Parçalarını Yükle (Header & Sidebar)
            await loadRequiredHTML(isAdminPage);

            // 3. Event Listener'ları Tanımla (Menü açma/kapama vb.)
            setupEventListeners();

            // 4. Kullanıcı Oturumunu Kontrol Et
            await checkUserAuthState();

            // 5. Sayfa Başlıklarını Ayarla
            ensurePageHeader({ isAdminPage, title: config.title });
            const pageTitleEl = document.getElementById('pageTitle');
            if (pageTitleEl) pageTitleEl.textContent = config.title;

            // 6. Sidebar'da Aktif Menüyü İşaretle
            if (!isAdminPage) {
                setActiveMenuItem(config.id);
            } else {
                // Admin tarafında hash değişimini de dinle
                window.addEventListener('hashchange', highlightAdminMenu);
                highlightAdminMenu();
            }

            // Sayfayı Görünür Yap (FOUC önleme)
            document.body.style.visibility = 'visible';
            return true;

        } catch (error) {
            console.error('❌ Arayüz Yükleme Hatası:', error);
            document.body.style.visibility = 'visible';
            throw error;
        }
    })();

    return layoutInitPromise;
}

/**
 * Admin veya Public sayfasına göre doğru Header/Sidebar dosyalarını çeker.
 */
async function loadRequiredHTML(isAdminPage) {
    // 1. HEADER (Tek Header Yapısı)
    const headerUrl = '/components/layouts/universal-header.html';
    const headerTargetId = document.getElementById('app-header-placeholder') ? 'app-header-placeholder' : 'header-area';

    // 2. SIDEBAR (Sayfaya Göre Değişir)
    const sidebarUrl = isAdminPage
        ? '/partials/admin-sidebar.html'
        : '/partials/sidebar.html';

    // 3. FOOTER (Sadece Public Sayfalarda)
    // Admin sayfasındaysak footerUrl null olsun, yüklenmesin.
    const footerTargetId = document.getElementById('app-footer-placeholder') || document.getElementById('footer-area');
    const footerUrl = isAdminPage ? null : '/components/footer.html';

    const promises = [
        loadHTML(headerUrl, headerTargetId),
        loadHTML(sidebarUrl, 'sidebar')
    ];

    if (footerTargetId && footerUrl) {
        promises.push(loadHTML(footerUrl, footerTargetId));
    }

    await Promise.all(promises);

    // Header yüklendikten sonra Admin/User linklerini ayarla
    setupUniversalHeader(isAdminPage);
}

function ensurePageHeader({ isAdminPage, title }) {
    const rootLink = document.getElementById('pageBreadcrumbRoot');
    if (rootLink) {
        if (isAdminPage) {
            rootLink.textContent = 'Yönetim';
            rootLink.setAttribute('href', '/admin/index.html');
        } else {
            rootLink.textContent = 'Panel';
            rootLink.setAttribute('href', '/pages/dashboard.html');
        }
    }
}

function setupUniversalHeader(isAdmin) {
    const adminLink = document.getElementById('adminPanelLink');
    const backToSiteLink = document.getElementById('backToSiteLink');

    if (adminLink) adminLink.style.display = 'none'; // Auth kontrolüyle açılacak
    if (backToSiteLink) backToSiteLink.style.display = isAdmin ? 'block' : 'none';

    // Mobil Menü Toggle
    const toggleBtn = document.getElementById('universal-toggle-btn');
    if (toggleBtn) {
        const newBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);

        // Kayıtlı sidebar durumunu yükle (LocalStorage)
        const savedState = localStorage.getItem('sidebarState');
        if (savedState === 'collapsed' && window.innerWidth > 1024) {
            document.body.classList.add('sidebar-collapsed');
        }

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.innerWidth > 1024) {
                // Masaüstü: Daralt/Genişlet
                document.body.classList.toggle('sidebar-collapsed');
                const isCollapsed = document.body.classList.contains('sidebar-collapsed');
                localStorage.setItem('sidebarState', isCollapsed ? 'collapsed' : 'expanded');
            } else {
                // Mobil: Aç/Kapa
                const sidebar = document.getElementById('sidebar');
                const overlay = document.getElementById('sidebarOverlay');
                if (sidebar) sidebar.classList.toggle('active');
                if (overlay) overlay.classList.toggle('active');
            }
        });
    }
}

export async function loadHTML(url, targetId) {
    const target = (typeof targetId === 'string') ? document.getElementById(targetId) : targetId;
    if (!target) return;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        target.innerHTML = await response.text();
    } catch (e) {
        console.error(`❌ HTML Yüklenemedi (${url}):`, e);
    }
}

function setupEventListeners() {
    // 1. Profil Dropdown
    const toggleBtn = document.getElementById('userAvatarBtn');
    const dropdown = document.getElementById('userDropdown');

    if (toggleBtn && dropdown) {
        const newBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !newBtn.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    // 2. Mobil Sidebar Toggle (Alternatif Butonlar İçin)
    const mobileToggle = document.getElementById('sidebar-toggle') || document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (mobileToggle && sidebar) {
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('active');
            if (overlay) overlay.classList.toggle('active');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });
    }

    // 3. Çıkış Butonu
    document.body.addEventListener('click', e => {
        const target = e.target.closest('button, a');
        if (!target) return;
        if (target.id === 'logoutBtn' || target.id === 'logoutButton' || target.classList.contains('logout')) {
            e.preventDefault();
            handleLogout();
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
                    
                    updateUIAfterLogin(user, profile || {}, isAdmin);
                } catch (e) {
                    console.error('Auth state hatası:', e);
                }
            } else {
                // Giriş yapmamışsa, public sayfalar hariç login'e yönlendir
                const publicPages = ['/login.html', '/public/login.html', '/', '/index.html'];
                const isPublic = publicPages.some(p => window.location.pathname.endsWith(p));
                
                if (!isPublic && !window.location.pathname.includes('404')) {
                    // console.warn("Oturum yok, yönlendiriliyor...");
                    window.location.href = '/public/login.html';
                }
            }
            resolve();
        });
    });
}

function updateUIAfterLogin(user, profile, isAdmin) {
    const name = (profile.ad && profile.soyad) ? `${profile.ad} ${profile.soyad}` : (user.displayName || "Kullanıcı");
    const email = user.email || "";
    const photoURL = profile.photoURL || user.photoURL;

    // Header ve Sidebar Güncelleme
    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.textContent = txt; };
    
    setText('dropdownUserName', name);
    setText('dropdownUserEmail', email);
    setText('sidebarUserName', name);
    setText('userNameLabel', name);

    const avatarImg = document.getElementById('headerAvatarImg');
    if (avatarImg && photoURL) avatarImg.src = photoURL;

    // Admin Linklerini Göster/Gizle
    const adminLinks = document.querySelectorAll('#adminPanelLink, #admin-link-container');
    adminLinks.forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
        if(isAdmin) el.classList.remove('hidden');
    });
}

function setActiveMenuItem(activePageId) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !activePageId) return;

    sidebar.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    
    const activeItem = sidebar.querySelector(`[data-page="${activePageId}"]`) || sidebar.querySelector(`a[href*="${activePageId}"]`);
    if (activeItem) activeItem.classList.add('active');
}

function highlightAdminMenu() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    const hash = window.location.hash || '#dashboard';
    const activeLink = Array.from(sidebar.querySelectorAll('a.nav-item')).find(link => {
        const href = link.getAttribute('href');
        return href && href.endsWith(hash);
    });

    if (activeLink) activeLink.classList.add('active');
}

async function handleLogout() {
    if (confirm("Çıkış yapmak istiyor musunuz?")) {
        await signOut(auth);
        window.location.href = '/public/login.html';
    }
}