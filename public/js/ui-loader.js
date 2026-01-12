import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

const dom = {};

export async function initLayout(activePageId, pageTitle = 'Genel Bakış') {
    try {
        // 1. Önce Header ve Sidebar içeriğini yükle
        // Sidebar için 'sidebar' ID'li mevcut konteyneri kullanıyoruz (Duplicate önlemek için)
        await Promise.all([
            loadHTML('/partials/sidebar.html', 'sidebar', 'innerHTML'),
            loadHTML('/partials/app-header.html', 'main-content', 'prepend')
        ]);

        cacheDomElements();

        if (dom.pageTitle) dom.pageTitle.textContent = pageTitle;
        setActiveMenuItem(activePageId);
        setupEventListeners();

        // Auth durumunu bekle ve UI güncelle
        await checkUserAuthState();

        return true;
    } catch (error) {
        console.error('Layout init error:', error);
        return false;
    }
}

async function loadHTML(url, targetId, position = 'append') {
    const target = document.getElementById(targetId);
    if (!target) {
        console.warn(`${targetId} element not found for loading ${url}`);
        return;
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();

        if (position === 'innerHTML') {
            target.innerHTML = html;
        } else if (position === 'prepend') {
            target.insertAdjacentHTML('afterbegin', html);
        } else {
            target.insertAdjacentHTML('beforeend', html);
        }
    } catch (e) {
        console.error(`Error loading HTML from ${url}:`, e);
    }
}

function cacheDomElements() {
    // DOM referanslarını güncelle
    Object.assign(dom, {
        sidebar: document.getElementById('sidebar'),
        mobileMenuToggle: document.getElementById('mobileMenuToggle'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
        closeSidebarBtn: document.getElementById('closeSidebar'), // Sidebar partial içinde olmalı
        
        // Header ve User Menu
        userMenuToggle: document.getElementById('userMenuToggle'),
        profileDropdown: document.getElementById('profileDropdown'),
        logoutButton: document.getElementById('logoutButton'),
        
        // Profil Bilgileri
        userNameLabel: document.getElementById('userNameLabel'),
        userRoleLabel: document.getElementById('userRoleLabel'),
        userAvatarCircle: document.getElementById('userAvatarCircle'),
        userAvatarImage: document.getElementById('userAvatarImage'),
        userAvatarInitial: document.getElementById('userAvatarInitial'),
        
        // Dropdown Profil Bilgileri
        dropdownUserName: document.getElementById('dropdownUserName'),
        dropdownUserEmail: document.getElementById('dropdownUserEmail'),
        dropdownAvatarCircle: document.getElementById('dropdownAvatarCircle'),
        dropdownAvatarImage: document.getElementById('dropdownAvatarImage'),
        dropdownAvatarInitial: document.getElementById('dropdownAvatarInitial'),
        
        pageTitle: document.getElementById('pageTitle')
    });
}

function setActiveMenuItem(activePageId) {
    if (!dom.sidebar) return;
    const navItems = dom.sidebar.querySelectorAll('.nav-item, .nav-link'); // Genişletilmiş seçici
    navItems.forEach(item => {
        // data-page attribute'unu kontrol et
        if (item.dataset.page === activePageId) {
            item.classList.add('active');
            // Eğer bir submenu içindeyse, parent'ı da aç (opsiyonel)
        }
    });
}

function setupEventListeners() {
    // Mobile Menu Toggle - Güvenli Kontrol
    if (dom.mobileMenuToggle && dom.sidebar && dom.sidebarOverlay) {
        // Event listener'ları temizle (tekrar yüklemelerde duplicate olmasın)
        dom.mobileMenuToggle.replaceWith(dom.mobileMenuToggle.cloneNode(true));
        dom.sidebarOverlay.replaceWith(dom.sidebarOverlay.cloneNode(true));
        
        // Elementleri tekrar al (replaceWith referansı bozar)
        dom.mobileMenuToggle = document.getElementById('mobileMenuToggle');
        dom.sidebarOverlay = document.getElementById('sidebarOverlay');

        const toggleMenu = (e) => {
            e?.stopPropagation(); // Tıklamanın yayılmasını engelle
            dom.sidebar.classList.toggle('active');
            dom.sidebarOverlay.classList.toggle('active');
        };

        dom.mobileMenuToggle.addEventListener('click', toggleMenu);
        dom.sidebarOverlay.addEventListener('click', toggleMenu);
        
        // Sidebar içindeki kapatma butonu (eğer varsa)
        const closeBtn = dom.sidebar.querySelector('#closeSidebar');
        if (closeBtn) {
            closeBtn.addEventListener('click', toggleMenu);
        }
    }

    // User Dropdown Toggle
    if (dom.userMenuToggle && dom.profileDropdown) {
        dom.userMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.profileDropdown.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!dom.userMenuToggle.contains(e.target) && !dom.profileDropdown.contains(e.target)) {
                dom.profileDropdown.classList.remove('active');
            }
        });
    }

    // Logout
    if (dom.logoutButton) {
        dom.logoutButton.onclick = handleLogout;
    }
}

async function handleLogout() {
    if (confirm("Çıkış yapmak istediğinize emin misiniz?")) {
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Logout error:', error);
        }
    }
}

async function checkUserAuthState() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const profile = await getUserProfile(user.uid);
                if (profile) {
                    updateUI(user, profile);
                    applyRolePermissions(profile.role);
                }
            } catch (err) {
                console.error("Profil alınamadı:", err);
            }
        } else {
            // Login sayfasında değilse yönlendir
            if (!window.location.pathname.includes('/login.html') && 
                !window.location.pathname.includes('/public/index.html') && // Landing page istisnası
                window.location.pathname !== '/') {
                window.location.href = '/login.html';
            }
        }
    });
}

function updateUI(user, profile) {
    const fullName = profile.ad ? `${profile.ad} ${profile.soyad}` : (user.displayName || 'Kullanıcı');
    const roleText = translateRole(profile.role);
    const initial = fullName.charAt(0).toUpperCase();
    const photoURL = profile.photoURL || user.photoURL;

    // Helper update function
    const setText = (el, txt) => { if(el) el.textContent = txt; };
    
    setText(dom.userNameLabel, fullName);
    setText(dom.userRoleLabel, roleText);
    setText(dom.dropdownUserName, fullName);
    setText(dom.dropdownUserEmail, user.email);
    setText(dom.userAvatarInitial, initial);
    setText(dom.dropdownAvatarInitial, initial);

    // Avatar Image Handling
    const updateAvatarImg = (circleEl, imgEl, url) => {
        if (circleEl && imgEl) {
            if (url) {
                circleEl.classList.add('has-photo');
                imgEl.src = url;
                imgEl.style.display = 'block';
            } else {
                circleEl.classList.remove('has-photo');
                imgEl.style.display = 'none';
            }
        }
    };

    updateAvatarImg(dom.userAvatarCircle, dom.userAvatarImage, photoURL);
    updateAvatarImg(dom.dropdownAvatarCircle, dom.dropdownAvatarImage, photoURL);
}

function applyRolePermissions(role) {
    // Varsayılan olarak admin elementlerini gizle
    const adminElements = document.querySelectorAll('.admin-only');
    
    if (role === 'admin' || role === 'editor') {
        adminElements.forEach(el => {
            el.style.display = 'flex'; // veya 'block', yapısına göre
            el.classList.remove('hidden');
        });
    } else {
        adminElements.forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
    }
}

function translateRole(role) {
    const roles = {
        'admin': 'Yönetici',
        'editor': 'Editör',
        'student': 'Öğrenci'
    };
    return roles[role] || 'Kullanıcı';
}