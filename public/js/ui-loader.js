import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

const dom = {};

export async function initLayout(activePageId, pageTitle = 'Genel Bakış') {
    try {
        await Promise.all([
            // Sidebar'ı mainWrapper içine ekle (önceden sidebar overlay ile birlikte)
            loadHTML('/partials/sidebar.html', 'mainWrapper', 'prepend'),
            // Header'ı main-content içine başa ekle
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

function cacheDomElements() {
    dom.sidebar = document.getElementById('sidebar');
    dom.pageTitle = document.getElementById('pageTitle');
    dom.mobileMenuToggle = document.getElementById('mobileMenuToggle');
    dom.sidebarOverlay = document.getElementById('sidebarOverlay');
    dom.userMenuToggle = document.getElementById('userMenuToggle');
    dom.profileDropdown = document.getElementById('profileDropdown');
    dom.logoutButton = document.getElementById('logoutButton');
    // Sidebar içindeki logout butonu (partial'dan geliyor olabilir)
    dom.sidebarLogoutBtn = document.querySelector('.sidebar .btn-logout');
}

function setActiveMenuItem(activePageId) {
    if (!dom.sidebar) return;
    const items = dom.sidebar.querySelectorAll(`[data-page="${activePageId}"]`);
    items.forEach(item => item.classList.add('active'));
}

function setupEventListeners() {
    // Mobile Menu
    if (dom.mobileMenuToggle && dom.sidebarOverlay) {
        // Event listener duplication önlemek için
        const newBtn = dom.mobileMenuToggle.cloneNode(true);
        dom.mobileMenuToggle.parentNode.replaceChild(newBtn, dom.mobileMenuToggle);
        dom.mobileMenuToggle = newBtn;

        const toggleMenu = (e) => {
            e?.stopPropagation();
            const sb = document.getElementById('sidebar');
            const ov = document.getElementById('sidebarOverlay');
            if(sb) sb.classList.toggle('active');
            if(ov) ov.classList.toggle('active');
        };

        dom.mobileMenuToggle.addEventListener('click', toggleMenu);
        dom.sidebarOverlay.addEventListener('click', toggleMenu);
    }

    // Dropdown
    if (dom.userMenuToggle && dom.profileDropdown) {
        dom.userMenuToggle.onclick = (e) => {
            e.stopPropagation();
            dom.profileDropdown.classList.toggle('active');
        };
        
        document.addEventListener('click', (e) => {
            if(!dom.userMenuToggle.contains(e.target) && !dom.profileDropdown.contains(e.target)) {
                dom.profileDropdown.classList.remove('active');
            }
        });
    }

    // Logout Handler
    const handleLogout = async () => {
        if(confirm("Çıkış yapmak istiyor musunuz?")) {
            await signOut(auth);
            window.location.href = '/login.html';
        }
    };

    if(dom.logoutButton) dom.logoutButton.onclick = handleLogout;
    if(dom.sidebarLogoutBtn) dom.sidebarLogoutBtn.onclick = handleLogout;
}

async function checkUserAuthState() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const profile = await getUserProfile(user.uid);
                // UI güncellemesi
                updateUIAfterLogin(user, profile || {});
                // Rol kontrolü
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
    // İsim: DB > Auth > Varsayılan
    const name = (profile.ad ? `${profile.ad} ${profile.soyad}` : user.displayName) || "Kullanıcı";
    const role = translateRole(profile.role);
    const photo = profile.photoURL || user.photoURL;
    const init = name.charAt(0).toUpperCase();

    // DOM Elementlerini Anlık Seç (Cache'e güvenme, dinamik yükleniyor)
    const els = {
        name: document.getElementById('userNameLabel'),
        role: document.getElementById('userRoleLabel'),
        dropName: document.getElementById('dropdownUserName'),
        dropEmail: document.getElementById('dropdownUserEmail'),
        
        // Avatar Header
        avCirc: document.getElementById('userAvatarCircle'),
        avImg: document.getElementById('userAvatarImage'),
        avInit: document.getElementById('userAvatarInitial'),
        
        // Avatar Dropdown
        dropCirc: document.getElementById('dropdownAvatarCircle'),
        dropImg: document.getElementById('dropdownAvatarImage'),
        dropInit: document.getElementById('dropdownAvatarInitial')
    };

    if(els.name) els.name.textContent = name;
    if(els.role) els.role.textContent = role;
    if(els.dropName) els.dropName.textContent = name;
    if(els.dropEmail) els.dropEmail.textContent = user.email;

    // Avatar Helper
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

function checkUserRole(role) {
    if(role === 'admin' || role === 'editor') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'flex'; // 'block' yerine 'flex' genelde menüler için daha iyidir
            el.classList.remove('hidden');
        });
    }
}

function translateRole(role) {
    const r = { admin: 'Yönetici', editor: 'Editör', student: 'Öğrenci' };
    return r[role] || 'Kullanıcı';
}