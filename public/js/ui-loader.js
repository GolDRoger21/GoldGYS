import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

// Sayfa Konfigürasyonları
const PAGE_CONFIG = {
    '/pages/dashboard.html': { id: 'dashboard', title: 'Genel Bakış' },
    '/admin/index.html': { id: 'admin', title: 'Yönetim Paneli' },
    '/pages/profil.html': { id: 'profile', title: 'Profilim' },
    '/pages/konular.html': { id: 'lessons', title: 'Dersler & Konular' },
    '/pages/testler.html': { id: 'tests', title: 'Testler' },
    '/pages/denemeler.html': { id: 'trials', title: 'Denemeler' },
};

const dom = {};
let layoutInitPromise = null;

/**
 * Arayüzü başlatan ana fonksiyon.
 * Admin sayfasında sadece HTML yükler, diğer sayfalarda Auth ve Eventleri de yönetir.
 */
export async function initLayout() {
    if (layoutInitPromise) return layoutInitPromise;

    layoutInitPromise = (async () => {
        const path = window.location.pathname;
        // Admin sayfasında mıyız kontrolü
        const isAdminPage = path.includes('/admin'); 
        const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Sayfa' };

        try {
            // 1. HTML Parçalarını Yükle (Header, Sidebar)
            await loadRequiredHTML(isAdminPage);
            
            // 2. Elementleri Seç
            cacheDomElements();

            // 3. Başlığı Ayarla (Varsa)
            if (dom.pageTitle) dom.pageTitle.textContent = config.title;

            // 4. SAYFA TÜRÜNE GÖRE AYRIŞTIRMA (KRİTİK BÖLÜM)
            if (isAdminPage) {
                // ADMIN SAYFASI:
                // Sadece HTML'i yükledik ve duruyoruz. 
                // Yetki kontrolü, menü olayları ve diğer her şey 'admin-page.js' tarafından yapılacak.
                // Bu sayede çakışma önlenir.
                console.log("🚀 Admin arayüzü yüklendi (Kontrol admin-page.js'de)");
            } else {
                // NORMAL KULLANICI SAYFASI:
                // Menüleri aktifleştir, oturum kontrolü yap, eventleri ekle.
                setActiveMenuItem(config.id);
                await checkUserAuthState();
                setupEventListeners(); // Normal sayfaların tıklama olayları
                console.log("👤 Kullanıcı arayüzü yüklendi");
            }

            // Sayfayı görünür yap
            document.body.style.visibility = 'visible';
            return true;

        } catch (error) {
            console.error('Arayüz Yükleme Hatası:', error);
            document.body.style.visibility = 'visible'; // Hata olsa da göster
            throw error;
        }
    })();

    return layoutInitPromise;
}

async function loadRequiredHTML(isAdminPage) {
    // Admin ve Normal sayfalar için farklı dosyalar ve ID'ler
    const headerUrl = isAdminPage ? '/public/components/layouts/admin-header.html' : '/public/components/header.html';
    const sidebarUrl = isAdminPage ? '/public/partials/admin-sidebar.html' : '/public/partials/sidebar.html';
    
    // Hedef ID'ler (HTML dosyasındaki <div id="..."> ile eşleşmeli)
    // admin/index.html'de header için 'header-area' veya 'main-content' olabilir, kontrol edin.
    // Eğer admin-page.js'de header-area yoksa header yüklenmez.
    const headerTargetId = document.getElementById('header-area') ? 'header-area' : (document.getElementById('main-content') ? 'main-content' : 'header-placeholder');
    const headerPosition = headerTargetId === 'main-content' ? 'prepend' : 'innerHTML';
    
    const sidebarTargetId = document.getElementById('sidebar') ? 'sidebar' : 'sidebar-placeholder';

    // Paralel Yükleme
    await Promise.all([
        loadHTML(headerUrl, headerTargetId, headerPosition),
        loadHTML(sidebarUrl, sidebarTargetId, 'innerHTML')
    ]);
}

async function loadHTML(url, targetId, position) {
    const target = document.getElementById(targetId);
    if (!target) return; // Hedef yoksa hata verme, sessizce geç
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        
        if (position === 'innerHTML') target.innerHTML = html;
        else target.insertAdjacentHTML(position === 'prepend' ? 'afterbegin' : 'beforeend', html);

        // Scriptleri manuel çalıştır (HTML import ile gelen scriptler için)
        target.querySelectorAll('script').forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
    } catch (e) {
        console.error(`${url} yüklenemedi:`, e);
    }
}

function cacheDomElements() {
    const ids = [
        'pageTitle', 'userMenuToggle', 'profileDropdown', 'logoutButton', 
        'sidebar', 'sidebarOverlay', 'closeSidebar', 'mobileMenuToggle',
        'userNameLabel', 'userRoleLabel', 
        'userAvatarCircle', 'userAvatarImage', 'userAvatarInitial',
        'dropdownUserName', 'dropdownUserEmail', 'dropdownAvatarCircle', 'dropdownAvatarImage', 'dropdownAvatarInitial'
    ];
    ids.forEach(id => dom[id] = document.getElementById(id));
}

// Sadece Kullanıcı Sayfaları İçin Event Listener'lar
function setupEventListeners() {
    document.body.addEventListener('click', e => {
        const target = e.target;
        
        // Profil Dropdown
        if (target.closest('#userMenuToggle')) {
            e.stopPropagation();
            dom.profileDropdown?.classList.toggle('active');
        }
        else if (dom.profileDropdown?.classList.contains('active') && !target.closest('#profileDropdown')) {
            dom.profileDropdown.classList.remove('active');
        }
        // Mobil Menü (Sadece kullanıcı sayfalarında, admin'de admin-page.js yönetir)
        else if (target.closest('#mobileMenuToggle') || target.closest('#closeSidebar') || target.closest('#sidebarOverlay')) {
            dom.sidebar?.classList.toggle('active');
            dom.sidebarOverlay?.classList.toggle('active');
        }
        // Çıkış
        else if (target.closest('#logoutButton')) {
            handleLogout();
        }
    });
}

// --- Auth ve UI Helper Fonksiyonları ---

async function checkUserAuthState() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const profile = await getUserProfile(user.uid);
                    updateUIAfterLogin(user, profile || {});
                } catch (e) { console.error(e); }
            } else {
               // Login değilse ve public sayfa değilse yönlendir
               const isPublic = window.location.pathname.includes('login') || window.location.pathname === '/' || window.location.pathname.includes('404');
               if(!isPublic) window.location.href = '/login.html';
            }
            resolve();
        });
    });
}

function updateUIAfterLogin(user, profile) {
    const name = (profile.ad && profile.soyad) ? `${profile.ad} ${profile.soyad}` : (user.displayName || "Kullanıcı");
    const email = user.email || "";
    const initial = name.charAt(0).toUpperCase();
    const photoURL = profile.photoURL || user.photoURL;

    // UI Güncelle
    if(dom.userNameLabel) dom.userNameLabel.textContent = name;
    if(dom.dropdownUserName) dom.dropdownUserName.textContent = name;
    if(dom.dropdownUserEmail) dom.dropdownUserEmail.textContent = email;

    // Avatar
    const updateAvatar = (circle, img, initEl) => {
        if(!circle) return;
        if (photoURL) {
            if(img) { img.src = photoURL; img.style.display = 'block'; }
            if(initEl) initEl.style.display = 'none';
        } else {
            if(img) img.style.display = 'none';
            if(initEl) { initEl.textContent = initial; initEl.style.display = 'flex'; }
        }
    };

    updateAvatar(dom.userAvatarCircle, dom.userAvatarImage, dom.userAvatarInitial);
    updateAvatar(dom.dropdownAvatarCircle, dom.dropdownAvatarImage, dom.dropdownAvatarInitial);
}

function setActiveMenuItem(activePageId) {
    if (!dom.sidebar || !activePageId) return;
    dom.sidebar.querySelectorAll('.active').forEach(item => item.classList.remove('active'));
    const activeItem = dom.sidebar.querySelector(`[data-page="${activePageId}"]`);
    if (activeItem) activeItem.classList.add('active');
}

async function handleLogout() {
    if (confirm("Çıkış yapmak istiyor musunuz?")) {
        await signOut(auth);
        window.location.href = '/login.html';
    }
}

// Otomatik Başlatma Kaldırıldı!
// Artık admin-page.js veya dashboard.js kendisi initLayout() çağıracak.