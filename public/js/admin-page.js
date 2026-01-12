
import { auth } from "./firebase-config.js";
import { requireAdminOrEditor } from "./role-guard.js";
// Modülleri import et
import * as DashboardModule from "./modules/admin/dashboard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as LegislationModule from "./modules/admin/legislation.js";
import * as ReportsModule from "./modules/admin/reports.js";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 1. Yetki ve Kullanıcı Bilgisini Al
        const { role, user } = await requireAdminOrEditor();
        console.log(`Panel Başlatıldı: ${role}`);

        // 2. Rol Rozetini Güncelle ("Yükleniyor..." yazısını kaldır)
        const roleBadge = document.getElementById('userRoleBadge');
        if (roleBadge) {
            roleBadge.textContent = role === 'admin' ? 'YÖNETİCİ' : 'İÇERİK EDİTÖRÜ';
            // Admin değilse bazı menüleri gizle
            if (role !== 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            }
        }

        // 3. Header Profil Bilgilerini Güncelle
        if (user) {
            const displayName = user.displayName || user.email?.split('@')[0] || 'Kullanıcı';
            const initials = getInitials(displayName, user.email);
            const photoUrl = user.photoURL || null;

            const headerName = document.getElementById('headerUserName');
            const dropdownName = document.getElementById('dropdownUserName');
            const dropdownEmail = document.getElementById('dropdownUserEmail');
            const headerAvatarInitial = document.getElementById('headerAvatarInitial');
            const dropdownAvatarInitial = document.getElementById('dropdownAvatarInitial');
            const avatarCircles = document.querySelectorAll('.user-avatar-circle');

            if (headerName) headerName.textContent = initials;
            if (dropdownName) dropdownName.textContent = initials;
            if (dropdownEmail) dropdownEmail.textContent = user.email || '';
            if (headerAvatarInitial) headerAvatarInitial.textContent = initials;
            if (dropdownAvatarInitial) dropdownAvatarInitial.textContent = initials;

            avatarCircles.forEach(circle => {
                const img = circle.querySelector('.user-avatar-image');
                if (img && photoUrl) {
                    img.src = photoUrl;
                    img.alt = `${displayName} profil fotoğrafı`;
                    circle.classList.add('has-photo');
                } else if (img) {
                    img.removeAttribute('src');
                    circle.classList.remove('has-photo');
                }
            });
        }

        // 4. Sekme Sistemi ve Global Fonksiyonlar
        window.openQuestionEditor = ContentModule.openQuestionEditor;
        window.AdminReports = ReportsModule.AdminReports;

        initTabs(role);
        initAdminMenu();
        
        const initialTab = window.location.hash.substring(1) || 'dashboard';
        handleTabChange(initialTab, role);
        
        const activeTabEl = document.querySelector(`.nav-item[data-tab="${initialTab}"]`);
        if(activeTabEl) activeTabEl.classList.add('active');


    } catch (error) {
        console.error("Panel Hatası:", error);
        // Hata durumunda kullanıcıyı bilgilendir veya login'e yönlendir.
        // Örneğin: document.body.innerHTML = "Yetkilendirme hatası. Lütfen tekrar giriş yapın.";
    }
});

// Sekme Değiştirme Mantığı
function handleTabChange(target, role) {
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    
    const targetSection = document.getElementById(`section-${target}`);
    if (targetSection) {
        targetSection.style.display = 'block';
        
        // İlgili modülü yükle
        switch(target) {
            case 'dashboard': DashboardModule.initDashboard(); break;
            case 'users': if(role === 'admin') UserModule.initUsersPage(); break;
            case 'content': ContentModule.initContentPage(); break;
            case 'legislation': LegislationModule.initLegislationPage(); break;
            case 'reports': ReportsModule.initReportsPage(); break;
        }
    }
}

function initTabs(role) {
    const tabs = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const target = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            window.location.hash = target; // URL'i güncelle
            handleTabChange(target, role);
        });
    });
}

// Çıkış Yap Butonu
document.getElementById('logoutBtn')?.addEventListener('click', () => {
    auth.signOut().then(() => window.location.href = '/login.html');
});

function initAdminMenu() {
    document.body.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.user-menu-toggle');
        if (toggleBtn) {
            const container = toggleBtn.closest('.user-menu-container');
            const dropdown = container?.querySelector('.profile-dropdown');

            document.querySelectorAll('.profile-dropdown.active').forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });

            dropdown?.classList.toggle('active');
            e.stopPropagation();
            return;
        }

        if (!e.target.closest('.profile-dropdown') && !e.target.closest('.user-menu-toggle')) {
            document.querySelectorAll('.profile-dropdown.active').forEach(d => {
                d.classList.remove('active');
            });
        }

        if (e.target.closest('#logout-btn')) {
            if (confirm('Çıkış yapmak istiyor musunuz?')) {
                auth.signOut().then(() => {
                    window.location.href = '/login.html';
                });
            }
        }
    });
}

function getInitials(name, emailFallback) {
    const base = name?.trim() || emailFallback?.split('@')[0] || '';
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    if (parts.length === 1) {
        return parts[0][0]?.toUpperCase() || '?';
    }
    return '?';
}
