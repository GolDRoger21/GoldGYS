import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

export async function initLayout(activePageId) {
    try {
        // 1. Sidebar HTML'ini Yükle
        const response = await fetch('/partials/sidebar.html');
        if (!response.ok) throw new Error('Sidebar yüklenemedi');
        
        const html = await response.text();
        
        // Sidebar elementini bul veya oluştur
        let sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            sidebar = document.createElement('aside');
            sidebar.id = 'sidebar';
            sidebar.className = 'sidebar';
            document.body.prepend(sidebar);
        }
        
        // HTML'i yerleştir
        sidebar.innerHTML = html;

        // 2. Aktif Sayfayı İşaretle
        const activeItem = sidebar.querySelector(`.nav-item[data-page="${activePageId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }

        // 3. Mobil Menü ve Çıkış İşlemlerini Bağla
        setupMobileMenu();
        setupLogout();

        // 4. KRİTİK ADIM: Rol Kontrolü ve Yönetici Menüsünü Açma
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const profile = await getUserProfile(user.uid);
                
                if (profile && (profile.role === 'admin' || profile.role === 'editor')) {
                    const adminElements = document.querySelectorAll('.admin-only');
                    adminElements.forEach(el => {
                        if (el.classList.contains('nav-item')) {
                            el.style.display = 'flex'; // Linkler flex olmalı
                        } else {
                            el.style.display = 'block'; // Başlıklar block olmalı
                        }
                    });
                }
            }
        });

        return true;
    } catch (error) {
        console.error('Layout yükleme hatası:', error);
        return false;
    }
}

function setupMobileMenu() {
    const toggleBtn = document.getElementById('menuToggle');
    const closeBtn = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay') || createOverlay();

    function toggleMenu() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    if (toggleBtn) toggleBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMenu();
    };
    
    if (closeBtn) closeBtn.onclick = toggleMenu;
    if (overlay) overlay.onclick = toggleMenu;
}

function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    return overlay;
}

function setupLogout() {
    const btn = document.getElementById('logoutBtn');
    if (btn) {
        btn.onclick = async () => {
            if(confirm("Çıkış yapmak istediğinize emin misiniz?")) {
                await signOut(auth);
                window.location.href = '/login.html';
            }
        };
    }
}