
// ... (Importlar aynı kalabilir) ...
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

// ... (PAGE_CONFIG ve initLayout aynı kalsın) ...
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

export async function initLayout() {
    if (layoutInitPromise) return layoutInitPromise;

    layoutInitPromise = (async () => {
        const path = window.location.pathname;
        const isAdminPage = path.includes('/admin'); 
        const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Sayfa' };

        try {
            await loadRequiredHTML(isAdminPage);
            cacheDomElements();
            if (dom.pageTitle) dom.pageTitle.textContent = config.title;

            if (isAdminPage) {
                console.log("🚀 Admin arayüzü yüklendi (Kontrol admin-page.js'de)");
            } else {
                setActiveMenuItem(config.id);
                await checkUserAuthState();
                setupEventListeners();
                console.log("👤 Kullanıcı arayüzü yüklendi");
            }

            document.body.style.visibility = 'visible';
            return true;

        } catch (error) {
            console.error('Arayüz Yükleme Hatası:', error);
            document.body.style.visibility = 'visible';
            throw error;
        }
    })();

    return layoutInitPromise;
}

async function loadRequiredHTML(isAdminPage) {
    const headerUrl = isAdminPage ? '/components/layouts/admin-header.html' : '/components/header.html';
    const sidebarUrl = isAdminPage ? '/partials/admin-sidebar.html' : '/partials/sidebar.html';
    
    const headerTargetId = document.getElementById('header-area') ? 'header-area' : (document.getElementById('main-content') ? 'main-content' : 'header-placeholder');
    const headerPosition = headerTargetId === 'main-content' ? 'prepend' : 'innerHTML';
    
    const sidebarTargetId = document.getElementById('sidebar') ? 'sidebar' : 'sidebar-placeholder';

    await Promise.all([
        loadHTML(headerUrl, headerTargetId, headerPosition),
        loadHTML(sidebarUrl, sidebarTargetId, 'innerHTML')
    ]);
}

async function loadHTML(url, targetId, position) {
    const target = document.getElementById(targetId);
    if (!target) return;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        
        if (position === 'innerHTML') target.innerHTML = html;
        else target.insertAdjacentHTML(position === 'prepend' ? 'afterbegin' : 'beforeend', html);

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

function setupEventListeners() {
    document.body.addEventListener('click', e => {
        const target = e.target;
        
        if (target.closest('#userMenuToggle')) {
            e.stopPropagation();
            dom.profileDropdown?.classList.toggle('active');
        }
        else if (dom.profileDropdown?.classList.contains('active') && !target.closest('#profileDropdown')) {
            dom.profileDropdown.classList.remove('active');
        }
        else if (target.closest('#mobileMenuToggle') || target.closest('#closeSidebar') || target.closest('#sidebarOverlay')) {
            dom.sidebar?.classList.toggle('active');
            dom.sidebarOverlay?.classList.toggle('active');
        }
        else if (target.closest('#logoutButton')) {
            handleLogout();
        }
    });
}

// --- GÜNCELLENEN KISIM BAŞLANGICI ---

async function checkUserAuthState() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    // 1. Profil Verisini Çek
                    const profile = await getUserProfile(user.uid);
                    
                    // 2. Yetki Kontrolü (Token'dan)
                    const tokenResult = await user.getIdTokenResult();
                    const isAdmin = tokenResult.claims.admin === true || profile.role === 'admin';

                    // 3. Arayüzü Güncelle
                    updateUIAfterLogin(user, profile || {}, isAdmin);
                    
                } catch (e) { console.error(e); }
            } else {
               const isPublic = window.location.pathname.includes('login') || window.location.pathname === '/' || window.location.pathname.includes('404');
               if(!isPublic) window.location.href = '/login.html';
            }
            resolve();
        });
    });
}

function updateUIAfterLogin(user, profile, isAdmin) {
    const name = (profile.ad && profile.soyad) ? `${profile.ad} ${profile.soyad}` : (user.displayName || "Kullanıcı");
    const email = user.email || "";
    const initial = name.charAt(0).toUpperCase();
    const photoURL = profile.photoURL || user.photoURL;
    const roleText = isAdmin ? "Yönetici" : "Üye";

    // 1. İsim ve Rol Alanları (Hem Admin hem Portalda artık aynı ID'ler var)
    setTextContent('userNameLabel', name);
    setTextContent('userRoleLabel', roleText);
    setTextContent('dropdownUserName', name);
    setTextContent('dropdownUserEmail', email);
    
    // Admin sayfasındaki sidebar için ekstra kontrol
    setTextContent('sidebarUserName', name);
    setTextContent('sidebarUserRole', isAdmin ? "Sistem Yöneticisi" : "Kullanıcı");

    // 2. Avatar Güncelleme
    const circles = document.querySelectorAll('#userAvatarCircle'); // Sayfada birden fazla olabilir (mobil/desktop)
    circles.forEach(circle => {
        const img = circle.querySelector('.user-avatar-image');
        const txt = circle.querySelector('.user-avatar-initial');
        
        if (photoURL) {
            if (img) { img.src = photoURL; img.style.display = 'block'; }
            if (txt) txt.style.display = 'none';
        } else {
            if (img) img.style.display = 'none';
            if (txt) { txt.textContent = initial; txt.style.display = 'flex'; }
        }
    });

    // 3. Admin Butonunu Ekle (Sadece Portal Header'ındaysa)
    const adminBtnContainer = document.getElementById('adminButtonContainer');
    if (adminBtnContainer && isAdmin) {
        adminBtnContainer.innerHTML = `
            <a href="/admin/index.html" class="btn-admin-access">
                <span class="icon">⚙️</span> Yönetim Paneli
            </a>
        `;
    }
}

// Yardımcı Fonksiyon: Hata almadan text güncelle
function setTextContent(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
// --- GÜNCELLENEN KISIM BİTİŞİ ---

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
