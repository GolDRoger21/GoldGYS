import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

const dom = {};

export async function initLayout(activePageId, pageTitle = 'Genel Bakış') {
    try {
        // DÜZELTİLMİŞ YÜKLEME MANTIĞI
        await Promise.all([
            // Sidebar içeriğini, HTML'deki mevcut #sidebar elementinin içine yükle.
            loadHTML('/partials/sidebar.html', 'sidebar', 'innerHTML'),
            // Header'ı main-content'in başına ekle.
            loadHTML('/partials/app-header.html', 'main-content', 'prepend')
        ]);

        cacheDomElements();

        if (dom.pageTitle) dom.pageTitle.textContent = pageTitle;
        setActiveMenuItem(activePageId);
        setupEventListeners();

        // Auth durumunu bekle
        await checkUserAuthState();

        return true;
    } catch (error) {
        console.error('Layout Init Error:', error);
        return false;
    }
}

async function loadHTML(url, targetId, position = 'append') {
    const target = document.getElementById(targetId);
    if (!target) return;

    try {
        const response = await fetch(url);
        if(!response.ok) throw new Error(response.statusText);
        const html = await response.text();
        
        if (position === 'innerHTML') target.innerHTML = html;
        else if (position === 'prepend') target.insertAdjacentHTML('afterbegin', html);
        else target.insertAdjacentHTML('beforeend', html);
    } catch (e) {
        console.error(`Error loading ${url}:`, e);
    }
}

// ========== GÜNCELLENEN KISIM (cacheDomElements fonksiyonunu sadeleştiriyoruz) ==========
function cacheDomElements() {
    // Sadece statik veya logout gibi spesifik butonları tutalım
    dom.logoutButton = document.getElementById('logoutButton');
    dom.sidebarLogoutBtn = document.querySelector('.sidebar .btn-logout');
    dom.pageTitle = document.getElementById('pageTitle');
    // Diğer dinamik elemanları (toggle butonları) event delegation ile yöneteceğiz
}

// ========== GÜNCELLENEN KISIM (setupEventListeners fonksiyonu) ==========
function setupEventListeners() {
    // 1. GLOBAL EVENT DELEGATION (Tüm tıklamaları tek yerden yönet)
    document.addEventListener('click', (e) => {
        // A) Dropdown Menü Kontrolü
        const toggleBtn = e.target.closest('.user-menu-toggle');
        const dropdown = document.getElementById('profileDropdown');
        
        // Eğer butona tıklandıysa
        if (toggleBtn) {
            e.stopPropagation(); // Eventin yukarı tırmanmasını engelle
            dropdown?.classList.toggle('active');
        } 
        // Eğer dropdown dışına tıklandıysa kapat
        else if (dropdown && dropdown.classList.contains('active') && !e.target.closest('.profile-dropdown')) {
            dropdown.classList.remove('active');
        }

        // B) Mobil Sidebar Kontrolü
        const mobileToggle = e.target.closest('#mobileMenuToggle');
        const closeSidebar = e.target.closest('#closeSidebar');
        const overlay = e.target.closest('#sidebarOverlay');

        if (mobileToggle || closeSidebar || overlay) {
            const sb = document.getElementById('sidebar');
            const ov = document.getElementById('sidebarOverlay');
            sb?.classList.toggle('active');
            ov?.classList.toggle('active');
        }
    });

    // Logout Handler (Sabit butonlar için)
    const handleLogout = async () => {
        if(confirm("Çıkış yapmak istiyor musunuz?")) {
            await signOut(auth);
            window.location.href = '/login.html';
        }
    };

    if(dom.logoutButton) dom.logoutButton.onclick = handleLogout;
    if(dom.sidebarLogoutBtn) dom.sidebarLogoutBtn.onclick = handleLogout;
}

function setActiveMenuItem(activePageId) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const items = sidebar.querySelectorAll(`[data-page="${activePageId}"]`);
    items.forEach(item => item.classList.add('active'));
}

async function checkUserAuthState() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const profile = await getUserProfile(user.uid);
                updateUIAfterLogin(user, profile || {});
                checkUserRole(profile?.role || 'student');
            } catch (e) {
                console.error("User profile error:", e);
            }
        } else {
            if(!location.pathname.includes('login') && location.pathname !== '/') {
                window.location.href = '/login.html';
            }
        }
    });
}

function updateUIAfterLogin(user, profile) {
    const name = (profile.ad ? `${profile.ad} ${profile.soyad}` : user.displayName) || "Kullanıcı";
    const role = translateRole(profile.role);
    const photo = profile.photoURL || user.photoURL;
    const init = name.charAt(0).toUpperCase();

    const els = {
        name: document.getElementById('userNameLabel'),
        role: document.getElementById('userRoleLabel'),
        dropName: document.getElementById('dropdownUserName'),
        dropEmail: document.getElementById('dropdownUserEmail'),
        avCirc: document.getElementById('userAvatarCircle'),
        avImg: document.getElementById('userAvatarImage'),
        avInit: document.getElementById('userAvatarInitial'),
        dropCirc: document.getElementById('dropdownAvatarCircle'),
        dropImg: document.getElementById('dropdownAvatarImage'),
        dropInit: document.getElementById('dropdownAvatarInitial')
    };

    if(els.name) els.name.textContent = name;
    if(els.role) els.role.textContent = role;
    if(els.dropName) els.dropName.textContent = name;
    if(els.dropEmail) els.dropEmail.textContent = user.email;

    const setAv = (circ, img, txt) => {
        if(!circ || !img || !txt) return;
        if(photo) {
            circ.classList.add('has-photo');
            img.src = photo;
            img.style.display = 'block';
            txt.style.display = 'none';
        } else {
            circ.classList.remove('has-photo');
            img.style.display = 'none';
            txt.style.display = 'block';
            txt.textContent = init;
        }
    };

    setAv(els.avCirc, els.avImg, els.avInit);
    setAv(els.dropCirc, els.dropImg, els.dropInit);
}

// ========== GÜNCELLENEN KISIM (checkUserRole fonksiyonu) ==========
function checkUserRole(role) {
    if(role === 'admin' || role === 'editor') {
        document.querySelectorAll('.admin-only').forEach(el => {
            // Zorla 'flex' yapmak yerine, gizleyen inline stili kaldırıyoruz.
            // Böylece CSS dosyasındaki orijinal display değeri (block veya flex) devreye girer.
            el.removeAttribute('style'); 
            el.classList.remove('hidden');
        });
    }
}

function translateRole(role) {
    const r = { admin: 'Yönetici', editor: 'Editör', student: 'Öğrenci' };
    return r[role] || 'Kullanıcı';
}
