import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

// Sayfa yollarına karşılık gelen başlık ve menü ID'lerini tanımlayan harita
const PAGE_CONFIG = {
    '/pages/dashboard.html': { id: 'dashboard', title: 'Genel Bakış' },
    '/admin/index.html': { id: 'admin', title: 'Yönetim Paneli' },
    '/pages/profil.html': { id: 'profile', title: 'Profilim' },
    '/pages/konular.html': { id: 'lessons', title: 'Dersler & Konular' },
    // Diğer sayfaları buraya ekleyebilirsiniz
};

// DOM Elemanları için merkezi nesne
const dom = {};

/**
 * Arayüzü başlatan ana fonksiyon. Artık parametre almasına gerek yok.
 * Sayfa bilgisini URL'den otomatik olarak alacak.
 */
export async function initLayout() {
    // URL'i al ve uygun konfigürasyonu bul
    const path = window.location.pathname;
    const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Sayfa' };

    try {
        await loadRequiredHTML();
        cacheDomElements();

        if (dom.pageTitle) dom.pageTitle.textContent = config.title;
        setActiveMenuItem(config.id);

        await checkUserAuthState();
        setupEventListeners();
        
        // Her şey yüklendikten sonra sayfayı görünür yap
        document.body.style.visibility = 'visible';
        console.log(`Arayüz '${config.id}' sayfası için başarıyla yüklendi.`);

    } catch (error) {
        console.error('KRİTİK HATA: Arayüz başlatılamadı.', error);
        document.body.innerHTML = `<h1>Arayüz Yüklenemedi</h1><p>${error.message}</p>`;
        document.body.style.visibility = 'visible';
    }
}

async function loadRequiredHTML() {
    const isAdminPage = window.location.pathname.startsWith('/admin');
    const headerUrl = isAdminPage ? '/components/layouts/admin-header.html' : '/partials/app-header.html';
    const sidebarUrl = '/partials/sidebar.html';

    const partsToLoad = [
        // Ana içerik alanına header'ıprepend ile ekle
        { url: headerUrl, targetId: 'main-content', position: 'prepend' },
        // Kenar çubuğu (sidebar) alanını innerHTML ile doldur
        { url: sidebarUrl, targetId: 'sidebar', position: 'innerHTML' }
    ];

    await Promise.all(partsToLoad.map(part => loadHTML(part.url, part.targetId, part.position)));
}

async function loadHTML(url, targetId, position) {
    const target = document.getElementById(targetId);
    if (!target) throw new Error(`Kritik hedef eleman #${targetId} bulunamadı.`);
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} - ${url} yüklenemedi.`);
        const html = await response.text();
        if (position === 'innerHTML') target.innerHTML = html;
        else target.insertAdjacentHTML('afterbegin', html);
    } catch (e) {
        console.error(`${url} yüklenirken hata:`, e);
        throw e;
    }
}

function cacheDomElements() {
    const ids = [
        'pageTitle', 'userMenuToggle', 'profileDropdown', 'logoutButton', 'sidebar', 'sidebarOverlay', 'closeSidebar', 'mobileMenuToggle',
        'userNameLabel', 'userRoleLabel', 'userAvatarCircle', 'userAvatarImage', 'userAvatarInitial',
        'dropdownUserName', 'dropdownUserEmail', 'dropdownAvatarCircle', 'dropdownAvatarImage', 'dropdownAvatarInitial'
    ];
    ids.forEach(id => dom[id] = document.getElementById(id));
    dom.sidebarLogoutBtn = document.querySelector('.sidebar .btn-logout');
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
        else if (target.closest('#logoutButton') || target.closest('.sidebar .btn-logout')) {
            handleLogout();
        }
    });
}

async function checkUserAuthState() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const profile = await getUserProfile(user.uid);
                    updateUIAfterLogin(user, profile || {});
                    checkUserRole(profile?.role || 'student');
                    resolve();
                } catch (error) {
                    console.error("Oturum hatası:", error);
                    updateUIAfterLogin(user, {});
                    checkUserRole('student');
                    reject(error);
                }
            } else {
                if (!window.location.pathname.includes('/login.html') && window.location.pathname !== '/') {
                    window.location.href = '/login.html';
                }
                resolve();
            }
        });
    });
}

function updateUIAfterLogin(user, profile) {
    const name = (profile.ad && profile.soyad) ? `${profile.ad} ${profile.soyad}` : (user.displayName || "Kullanıcı");
    const email = user.email || "";
    const roleName = translateRole(profile.role);
    const photoURL = profile.photoURL || user.photoURL;
    const initial = name.charAt(0).toUpperCase();

    if(dom.userNameLabel) dom.userNameLabel.textContent = name;
    if(dom.userRoleLabel) dom.userRoleLabel.textContent = roleName;
    setAvatar(dom.userAvatarCircle, dom.userAvatarImage, dom.userAvatarInitial, photoURL, initial);

    if(dom.dropdownUserName) dom.dropdownUserName.textContent = name;
    if(dom.dropdownUserEmail) dom.dropdownUserEmail.textContent = email;
    setAvatar(dom.dropdownAvatarCircle, dom.dropdownAvatarImage, dom.dropdownAvatarInitial, photoURL, initial);
}

function setAvatar(circle, image, initialEl, photoURL, initial) {
    if (!circle || !image || !initialEl) return;
    if (photoURL) {
        circle.classList.add('has-photo');
        image.src = photoURL;
        image.style.display = 'block';
        initialEl.style.display = 'none';
    } else {
        circle.classList.remove('has-photo');
        image.style.display = 'none';
        initialEl.style.display = 'block';
        initialEl.textContent = initial;
    }
}

function checkUserRole(role) {
    const adminElements = document.querySelectorAll('.admin-only');
    const shouldBeVisible = (role === 'admin' || role === 'editor');
    adminElements.forEach(el => {
        el.style.display = shouldBeVisible ? '' : 'none';
    });
}

function setActiveMenuItem(activePageId) {
    if (!dom.sidebar || !activePageId) return;
    dom.sidebar.querySelectorAll('[data-page].active').forEach(item => item.classList.remove('active'));
    const activeItem = dom.sidebar.querySelector(`[data-page="${activePageId}"]`);
    if (activeItem) activeItem.classList.add('active');
}

async function handleLogout() {
    if (confirm("Çıkış yapmak istiyor musunuz?")) {
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Çıkış hatası:', error);
        }
    }
}

function translateRole(role) {
    const roles = { admin: 'Yönetici', editor: 'Editör', student: 'Öğrenci' };
    return roles[role] || 'Kullanıcı';
}

// --- OTOMATİK BAŞLATMA ---
// Script yüklendiğinde, DOM hazır olduğunda arayüzü otomatik olarak başlat.
document.addEventListener('DOMContentLoaded', initLayout);
