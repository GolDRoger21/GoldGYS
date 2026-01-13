import { requireAdminOrEditor } from "./role-guard.js";
// Modülleri import et
import * as DashboardModule from "./modules/admin/dashboard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as LegislationModule from "./modules/admin/legislation.js";
import * as ReportsModule from "./modules/admin/reports.js";

document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 1. Yetki ve Kullanıcı Bilgisini Al (Bu adımda yetkisiz kullanıcılar login'e atılır)
        const { role, user } = await requireAdminOrEditor();
        console.log(`Panel Başlatıldı: ${role}`);

        // 2. Rol Rozetini Güncelle
        const roleBadge = document.getElementById('userRoleBadge');
        if (roleBadge) {
            roleBadge.textContent = role === 'admin' ? 'YÖNETİCİ' : 'İÇERİK EDİTÖRÜ';
            // Admin değilse (Sadece Editör ise) bazı menüleri gizle
            if (role !== 'admin') {
                document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
            }
        }

        // 3. Header Profil Bilgilerini Güncelle (Header.html ile uyumlu ID'ler)
        if (user) {
            updateAdminHeaderProfile(user);
        }

        // 4. Sekme Sistemi ve Global Fonksiyonlar
        window.openQuestionEditor = ContentModule.openQuestionEditor;
        window.AdminReports = ReportsModule.AdminReports;

        initTabs(role);
        
        // URL'deki hash'e göre veya varsayılan olarak dashboard'u aç
        const initialTab = window.location.hash.substring(1) || 'dashboard';
        handleTabChange(initialTab, role);
        
        // Aktif sekmeyi işaretle
        const activeTabEl = document.querySelector(`.nav-item[data-tab="${initialTab}"]`);
        if(activeTabEl) activeTabEl.classList.add('active');

    } catch (error) {
        console.error("Panel Hatası:", error);
        // Yetki hatası durumunda zaten role-guard yönlendirme yapar, 
        // ancak ekstra güvenlik olarak body gizlenebilir.
        document.body.style.display = 'none';
    }
});

// Profil Bilgilerini Güncelleyen Yardımcı Fonksiyon
function updateAdminHeaderProfile(user) {
    const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Kullanıcı');
    const initials = getInitials(displayName, user.email);
    const photoUrl = user.photoURL || null;

    // Header.html'de tanımladığımız ID'ler
    const dropdownName = document.getElementById('dropdownUserName');
    const dropdownEmail = document.getElementById('dropdownUserEmail');
    
    // Header yuvarlak avatar
    const userAvatarInitial = document.getElementById('userAvatarInitial');
    const userAvatarImage = document.getElementById('userAvatarImage');
    const userAvatarCircle = document.getElementById('userAvatarCircle');

    // Dropdown içindeki büyük avatar
    const dropdownAvatarInitial = document.getElementById('dropdownAvatarInitial');
    const dropdownAvatarImage = document.getElementById('dropdownAvatarImage');
    const dropdownAvatarCircle = document.getElementById('dropdownAvatarCircle');

    // İsim ve Email Güncelleme
    if (dropdownName) dropdownName.textContent = displayName;
    if (dropdownEmail) dropdownEmail.textContent = user.email || '';

    // Baş Harfleri Ayarlama
    if (userAvatarInitial) userAvatarInitial.textContent = initials;
    if (dropdownAvatarInitial) dropdownAvatarInitial.textContent = initials;

    // Fotoğraf Varsa Göster, Yoksa Baş Harf Göster
    const updateAvatarVisuals = (imgEl, circleEl) => {
        if (!imgEl || !circleEl) return;
        
        if (photoUrl) {
            imgEl.src = photoUrl;
            imgEl.style.display = 'block';
            circleEl.classList.add('has-photo');
            // Baş harf elementini gizle (CSS ile de yapılabilir ama garanti olsun)
            const initialSpan = circleEl.querySelector('.user-avatar-initial');
            if(initialSpan) initialSpan.style.display = 'none';
        } else {
            imgEl.style.display = 'none';
            imgEl.removeAttribute('src');
            circleEl.classList.remove('has-photo');
            const initialSpan = circleEl.querySelector('.user-avatar-initial');
            if(initialSpan) initialSpan.style.display = 'flex';
        }
    };

    updateAvatarVisuals(userAvatarImage, userAvatarCircle);
    updateAvatarVisuals(dropdownAvatarImage, dropdownAvatarCircle);
}

// Sekme Değiştirme Mantığı
function handleTabChange(target, role) {
    // Sadece admin-section class'ına sahip alanları gizle
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    
    const targetSection = document.getElementById(`section-${target}`);
    if (targetSection) {
        targetSection.style.display = 'block';
        
        // İlgili modülü yükle ve başlat
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
            // Eğer link bir dış sayfaya (örn: Ana Panele Dön) gidiyorsa engelleme
            const href = tab.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
                return; // Normal link davranışına izin ver
            }

            e.preventDefault();
            const target = tab.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            window.location.hash = target; // URL'i güncelle
            handleTabChange(target, role);
        });
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