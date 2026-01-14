
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

const PAGE_CONFIG = {
    '/pages/dashboard.html': { id: 'dashboard', title: 'Genel Bakış' },
    '/admin/index.html': { id: 'admin', title: 'Yönetim Paneli' },
    '/pages/profil.html': { id: 'profile', title: 'Profilim' },
    '/pages/konular.html': { id: 'lessons', title: 'Dersler & Konular' },
    '/pages/testler.html': { id: 'tests', title: 'Testler' },
    '/pages/denemeler.html': { id: 'trials', title: 'Denemeler' },
};

let layoutInitPromise = null;

export async function initLayout() {
    if (layoutInitPromise) return layoutInitPromise;

    layoutInitPromise = (async () => {
        const path = window.location.pathname;
        const isAdminPage = path.includes('/admin');
        const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Sayfa' };

        try {
            await loadRequiredHTML(isAdminPage);
            
            // Eventleri ve Auth kontrolünü HER ZAMAN yap
            setupEventListeners(); 
            await checkUserAuthState();

            // Sayfa özelinde ayarları yap
            document.getElementById('pageTitle').textContent = config.title;
            if (!isAdminPage) {
                setActiveMenuItem(config.id);
            }

            console.log(isAdminPage ? "🚀 Admin arayüzü ve eventler yüklendi" : "👤 Kullanıcı arayüzü ve eventler yüklendi");
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
    
    await Promise.all([
        loadHTML(headerUrl, 'header-area', 'innerHTML'),
        loadHTML(sidebarUrl, 'sidebar', 'innerHTML')
    ]);
}

async function loadHTML(url, targetId, position) {
    const target = document.getElementById(targetId);
    if (!target) return;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        target.innerHTML = html;
    } catch (e) {
        console.error(`${url} yüklenemedi:`, e);
    }
}

function setupEventListeners() {
    // Google Style Dropdown Mantığı
    const toggleBtn = document.getElementById('userMenuToggle');
    const dropdown = document.getElementById('profileDropdown');
    if (toggleBtn && dropdown) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
        });
    }

    // Dışarıya veya ESC tuşuna basınca kapatma
    document.addEventListener('click', (e) => {
        if (dropdown && !dropdown.contains(e.target) && !toggleBtn.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dropdown && dropdown.classList.contains('show')) {
            dropdown.classList.remove('show');
        }
    });

    // Mobil Menü ve Çıkış Butonu (Event Delegation ile)
    document.body.addEventListener('click', e => {
        const target = e.target;
        if (target.closest('#mobileMenuToggle') || target.closest('#closeSidebar') || target.closest('#sidebarOverlay')) {
            document.getElementById('sidebar')?.classList.toggle('active');
            document.getElementById('sidebarOverlay')?.classList.toggle('active');
        }
        if (target.closest('#logoutButton')) {
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
                    const isAdmin = tokenResult.claims.admin === true || profile.role === 'admin';
                    updateUIAfterLogin(user, profile || {}, isAdmin);
                } catch (e) { console.error('Auth state change error:', e); }
            } else {
                const isPublic = ['/login.html', '/', '/index.html'].includes(window.location.pathname) || window.location.pathname.includes('404');
                if (!isPublic) window.location.href = '/login.html';
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

    // 1. İsim ve Email Güncelleme
    setTextContent('dropdownUserName', name);
    setTextContent('dropdownUserEmail', email);
    setTextContent('sidebarUserName', name);
    setTextContent('sidebarUserRole', isAdmin ? "Sistem Yöneticisi" : "Kullanıcı");

    // 2. Avatar Güncelleme (Yeni ID'ler ile)
    updateAvatar('headerAvatar', initial, photoURL);
    updateAvatar('dropdownAvatar', initial, photoURL);

    // 3. Admin Butonunu Ekle (Sadece portalda ve admin ise)
    const adminBtnContainer = document.getElementById('adminButtonContainer');
    if (adminBtnContainer) { // Sadece portal header'ında var
        if (isAdmin) {
            adminBtnContainer.innerHTML = `
                <a href="/admin/index.html" class="btn-admin-access">
                    <span class="icon">⚙️</span> Yönetim Paneli
                </a>`;
        } else {
            adminBtnContainer.innerHTML = ''; // Admin değilse boşalt
        }
    }
}

// Yardımcı Fonksiyonlar
function setTextContent(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function updateAvatar(baseId, initial, photoURL) {
    const img = document.getElementById(`${baseId}Img`);
    const txt = document.getElementById(`${baseId}Initial`);
    if (!img || !txt) return;

    if (photoURL) {
        img.src = photoURL;
        img.style.display = 'block';
        txt.style.display = 'none';
    } else {
        img.style.display = 'none';
        txt.textContent = initial;
        txt.style.display = 'flex';
    }
}

function setActiveMenuItem(activePageId) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !activePageId) return;
    sidebar.querySelectorAll('.nav-item.active').forEach(item => item.classList.remove('active'));
    const activeItem = sidebar.querySelector(`[data-page="${activePageId}"]`);
    if (activeItem) activeItem.classList.add('active');
}

async function handleLogout() {
    if (confirm("Çıkış yapmak istiyor musunuz?")) {
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch (error) {
            console.error("Çıkış yapılamadı:", error);
        }
    }
}
