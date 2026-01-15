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
        // URL Normalizasyonu (Clean URL Desteği)
        // /admin/importer -> /admin/importer.html olarak algıla
        let path = window.location.pathname;
        if (!path.endsWith('.html') && !path.endsWith('/')) {
            path += '.html';
        }
        // Ana sayfa düzeltmesi
        if (path === '/.html' || path === '/index.html') path = '/index.html';

        const isAdminPage = path.includes('/admin');
        const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Gold GYS' };

        // Debug için
        console.log(`📍 Sayfa Yükleniyor: ${path} (ID: ${config.id})`);

        try {
            // 1. HTML Parçalarını Yükle (Header & Sidebar)
            await loadRequiredHTML(isAdminPage);

            // 2. Event Listener'ları Tanımla (Menü açma/kapama vb.)
            setupEventListeners();

            // 3. Kullanıcı Oturumunu Kontrol Et ve UI'ı Güncelle
            await checkUserAuthState();

            // 4. Sayfa Başlığını ve Breadcrumb'u Ayarla
            ensurePageHeader({ isAdminPage, title: config.title });
            const pageTitleEl = document.getElementById('pageTitle');
            if (pageTitleEl) pageTitleEl.textContent = config.title;
            const breadcrumbCurrent = document.getElementById('pageBreadcrumbCurrent');
            if (breadcrumbCurrent) breadcrumbCurrent.textContent = config.title;

            // 5. Sidebar'da Aktif Menüyü İşaretle
            if (!isAdminPage) {
                // Public tarafta
                setActiveMenuItem(config.id);
            } else {
                // Admin tarafta (Hash değişince de tetikle)
                window.addEventListener('hashchange', () => highlightAdminMenu());
                highlightAdminMenu();
            }

            console.log("✅ Arayüz başarıyla yüklendi.");
            document.body.style.visibility = 'visible';
            return true;

        } catch (error) {
            console.error('❌ Arayüz Yükleme Hatası:', error);
            // Hata olsa bile sayfayı göster (Sonsuz beyaz ekranda kalmasın)
            document.body.style.visibility = 'visible';
            throw error;
        }
    })();

    return layoutInitPromise;
}

/**
 * Admin veya Public sayfasına göre doğru Header/Sidebar dosyalarını çeker.
 */
/**
 * Admin veya Public sayfasına göre doğru Header/Sidebar dosyalarını çeker.
 * ARTIK TEK BİR HEADER KULLANILIYOR: universal-header.html
 */
async function loadRequiredHTML(isAdminPage) {
    // 1. HEADER (Tek Header Yapısı)
    const headerUrl = '/components/layouts/universal-header.html';
    const headerTargetId = document.getElementById('app-header-placeholder') ? 'app-header-placeholder' : 'header-area';

    // 2. SIDEBAR (Sayfaya Göre Değişir)
    const sidebarUrl = isAdminPage
        ? '/partials/admin-sidebar.html'
        : '/partials/sidebar.html';

    const footerTargetId = document.getElementById('app-footer-placeholder')
        ? 'app-footer-placeholder'
        : (document.getElementById('footer-area') ? 'footer-area' : null);
    const footerUrl = isAdminPage
        ? '/components/layouts/admin-footer.html'
        : '/components/footer.html';
    const footerPromise = footerTargetId ? loadHTML(footerUrl, footerTargetId) : Promise.resolve();

    await Promise.all([
        loadHTML(headerUrl, headerTargetId),
        loadHTML(sidebarUrl, 'sidebar'),
        footerPromise
    ]);

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

    if (adminLink) {
        // Admin linkini sadece admin yetkisi varsa göster (daha sonra auth kontrolü tekrar yapacak)
        // Şimdilik varsayılan gizli, auth kontrolünde açılacak.
        adminLink.style.display = 'none';
    }

    if (backToSiteLink) {
        // Siteye Dön linki sadece Admin sayfasındaysak görünsün
        backToSiteLink.style.display = isAdmin ? 'block' : 'none';
    }

    // Mobil Menü Toggle Ayarı (Responsive Logic)
    const toggleBtn = document.getElementById('universal-toggle-btn');
    if (toggleBtn) {
        const newBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);

        // Başlangıç durumunu yükle
        const savedState = localStorage.getItem('sidebarState');
        if (savedState === 'collapsed' && window.innerWidth > 1024) {
            document.body.classList.add('sidebar-collapsed');
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('collapsed');
        }

        newBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');

            // Eğer Desktop ise (> 1024px) -> Collapse Toggle
            if (window.innerWidth > 1024) {
                document.body.classList.toggle('sidebar-collapsed');

                // Durumu kaydet
                const isCollapsed = document.body.classList.contains('sidebar-collapsed');
                localStorage.setItem('sidebarState', isCollapsed ? 'collapsed' : 'expanded');

            } else {
                // Eğer Mobil ise (<= 1024px) -> Overlay Toggle
                if (sidebar) sidebar.classList.toggle('active');
                if (overlay) overlay.classList.toggle('active');
            }
        });
    }
}

export async function loadHTML(url, targetId) {
    const target = document.getElementById(targetId);
    if (!target) {
        console.warn(`⚠️ Hedef element bulunamadı: #${targetId} (URL: ${url})`);
        return;
    }
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        target.innerHTML = html;
    } catch (e) {
        console.error(`❌ HTML Yüklenemedi (${url}):`, e);
        target.innerHTML = `<div style="color:red; padding:10px;">Hata: İçerik yüklenemedi.</div>`;
    }
}

/**
 * Dropdown, Sidebar Toggle ve Logout butonlarının olaylarını dinler.
 */
function setupEventListeners() {
    // 1. Profil Dropdown Menüsü (Yeni ID: userAvatarBtn)
    const toggleBtn = document.getElementById('userAvatarBtn');
    const dropdown = document.getElementById('userDropdown');

    if (toggleBtn && dropdown) {
        // Tıklama olayını temizle ve yeniden ekle (Duplicate önlemek için)
        const newBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);

        const toggleDropdown = (event) => {
            if (event && event.stopPropagation) event.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        };

        newBtn.addEventListener('click', (e) => {
            toggleDropdown(e);
        });

        // Dışarı tıklayınca kapat
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target) && !newBtn.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        window.toggleUserMenu = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            toggleDropdown(e);
        };
    }

    // 2. Mobil Sidebar Toggle
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

    // 3. Çıkış Butonu (Event Delegation - ID: logoutBtn veya logoutButton)
    document.body.addEventListener('click', e => {
        const target = e.target.closest('button, a');
        if (!target) return;

        if (target.id === 'logoutBtn' || target.id === 'logoutButton' || target.classList.contains('logout')) {
            e.preventDefault();
            handleLogout();
        }
    });

    window.handleLogout = handleLogout;
    // 4. Tema Değiştirme Butonu (Güneş/Ay) - EVENT DELEGATION
    // Buton dinamik olarak yüklenebildiği için document body üzerinden dinliyoruz.

    // İlk yüklemede temayı uygula
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') document.body.classList.add('light-mode');

    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-theme-toggle]');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation(); // Event bubbling'i durdur

        document.body.classList.toggle('light-mode');
        const isLight = document.body.classList.contains('light-mode');
        localStorage.setItem('theme', isLight ? 'light' : 'dark');

        console.log("Tema değiştirildi:", isLight ? 'Light' : 'Dark');
    });
}

/**
 * Kullanıcı oturum durumunu kontrol eder ve UI'ı günceller.
 */
async function checkUserAuthState() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    // Profil verisini çek
                    const profile = await getUserProfile(user.uid);

                    // Admin yetkisini kontrol et
                    const tokenResult = await user.getIdTokenResult();
                    const isAdmin = tokenResult.claims.admin === true || profile?.role === 'admin';

                    updateUIAfterLogin(user, profile || {}, isAdmin);
                } catch (e) {
                    console.error('Auth state hatası:', e);
                }
            } else {
                // Giriş yapılmamışsa ve korumalı sayfadaysa yönlendir
                const publicPages = ['/login.html', '/public/login.html', '/', '/index.html', '/public/index.html'];
                const isPublic = publicPages.some(p => window.location.pathname.endsWith(p)) || window.location.pathname.includes('404');

                if (!isPublic) {
                    console.warn("Oturum yok, yönlendiriliyor...");
                    window.location.href = '/public/login.html';
                }
            }
            resolve();
        });
    });
}

/**
 * Giriş yapıldıktan sonra Header ve Sidebar bilgilerini doldurur.
 */
function updateUIAfterLogin(user, profile, isAdmin) {
    const name = (profile.ad && profile.soyad) ? `${profile.ad} ${profile.soyad}` : (user.displayName || "Kullanıcı");
    const email = user.email || "";
    const photoURL = profile.photoURL || user.photoURL;

    // 1. Header Bilgilerini Güncelle (Yeni ID'ler)
    setTextContent('dropdownUserName', name);
    setTextContent('dropdownUserEmail', email);

    // Sidebar Bilgilerini Güncelle (Varsa)
    setTextContent('sidebarUserName', name); // Eski sidebar yapısı için
    setTextContent('userNameLabel', name);   // Yeni sidebar yapısı için

    // 2. Avatar Güncelleme
    const avatarImg = document.getElementById('headerAvatarImg');
    if (avatarImg && photoURL) {
        avatarImg.src = photoURL;
    }

    // 3. Admin Butonunu Göster (Sadece yetkili ise)
    const adminLink = document.getElementById('adminPanelLink'); // Dropdown içindeki li
    const adminLinkSidebar = document.getElementById('admin-link-container'); // Sidebar'daki div

    if (isAdmin) {
        if (adminLink) adminLink.style.display = 'block';
        if (adminLinkSidebar) {
            adminLinkSidebar.classList.remove('hidden');
            adminLinkSidebar.style.display = 'block';
        }
    } else {
        if (adminLink) adminLink.style.display = 'none';
        if (adminLinkSidebar) adminLinkSidebar.style.display = 'none';
    }
}

// --- Yardımcı Fonksiyonlar ---

function setTextContent(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setActiveMenuItem(activePageId) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !activePageId) return;

    // Tüm aktif sınıfları temizle
    sidebar.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    sidebar.querySelectorAll('.nav-link').forEach(item => item.classList.remove('active'));

    // İlgili menüyü bul ve aktif yap
    const activeItem = sidebar.querySelector(`[data-page="${activePageId}"]`) || sidebar.querySelector(`a[href*="${activePageId}"]`);
    if (activeItem) activeItem.classList.add('active');
}

async function handleLogout() {
    if (confirm("Çıkış yapmak istiyor musunuz?")) {
        try {
            await signOut(auth);
            window.location.href = '/public/login.html';
        } catch (error) {
            console.error("Çıkış yapılamadı:", error);
            alert("Çıkış sırasında bir hata oluştu.");
        }
    }
}

/**
 * Admin panelinde URL hash'ine göre menüyü aktif yapar.
 */
function highlightAdminMenu() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Tüm aktifleri temizle
    sidebar.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Hash kontrolü (örn: #users)
    const hash = window.location.hash || '#dashboard';

    // Hash ile eşleşen linki bul
    const activeLink = Array.from(sidebar.querySelectorAll('a.nav-item')).find(link => {
        const href = link.getAttribute('href');
        return href && href.endsWith(hash);
    });

    if (activeLink) {
        activeLink.classList.add('active');
    }
}
