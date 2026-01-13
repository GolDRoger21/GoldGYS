import { requireAdminOrEditor } from "./role-guard.js";
// DÜZELTME 1: UI Loader import edildi. HTML parçaları (sidebar, header) yüklenmeden JS çalışmamalı.
import { initLayout } from "./ui-loader.js";

// --- MODÜL IMPORTLARI ---
import * as DashboardModule from "./modules/admin/dashboard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as LegislationModule from "./modules/admin/legislation.js";
import * as ReportsModule from "./modules/admin/reports.js";
import * as ExamsModule from "./modules/admin/exams.js";      // Sınav Modülü
import * as ImporterModule from "./modules/admin/importer.js";  // Toplu Yükleme

// --- SAYFA BAŞLANGICI ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // DÜZELTME 2: Önce arayüz parçalarının (Header, Sidebar) yüklenmesini bekle.
        // Bu işlem bitmeden aşağıdaki element seçimleri (getElementById vb.) null döner.
        await initLayout(); 
        console.log("✅ Arayüz (Layout) başarıyla yüklendi.");

        // 1. GÜVENLİK VE ROL KONTROLÜ
        const { role, user } = await requireAdminOrEditor();
        console.log(`✅ Panel Başlatıldı. Rol: ${role}, Kullanıcı: ${user.email}`);

        // 2. ARAYÜZÜ ROL GÖRE DÜZENLE
        const roleBadge = document.getElementById('userRoleBadge');
        const sidebarRole = document.getElementById('sidebarUserRole');
        const sidebarName = document.getElementById('sidebarUserName');

        // Rozetleri ve İsimleri Güncelle
        const roleText = role === 'admin' ? 'SİSTEM YÖNETİCİSİ' : 'İÇERİK EDİTÖRÜ';
        if (roleBadge) roleBadge.textContent = roleText;
        if (sidebarRole) sidebarRole.textContent = roleText;
        if (sidebarName) sidebarName.textContent = user.displayName || user.email.split('@')[0];

        // Admin olmayanlardan "Yönetim" menülerini gizle
        if (role !== 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        }

        // Header Profil Resmini Güncelle
        updateAdminHeaderProfile(user);

        // 3. GLOBAL FONKSİYONLARI TANIMLA
        window.openQuestionEditor = ContentModule.openQuestionEditor;
        window.AdminReports = ReportsModule.AdminReports;

        // 4. ETKİLEŞİM VE MENÜLERİ BAŞLAT
        initTheme(); // DÜZELTME 3: Tema ayarlarını başlat
        initInteractions(role);
        
        // URL'de hash varsa (örn: #exams) o sekmeyi aç, yoksa Dashboard'u aç
        const initialTab = window.location.hash.substring(1) || 'dashboard';
        activateTab(initialTab, role);

    } catch (error) {
        console.error("❌ Panel Başlatma Hatası:", error);
        const contentWrapper = document.querySelector('.content-wrapper');
        if(contentWrapper) contentWrapper.style.display = 'none';
        alert("Yetki kontrolü veya arayüz yüklemesi sırasında hata oluştu: " + error.message);
    }
});

// --- TEMA YÖNETİMİ (YENİ EKLENDİ) ---
function initTheme() {
    const themeToggle = document.querySelector('[data-theme-toggle]'); // Header'daki buton
    const body = document.body;
    
    // Kayıtlı temayı kontrol et
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        body.classList.add('light-mode');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            body.classList.toggle('light-mode');
            const isLight = body.classList.contains('light-mode');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
        });
    }
}

// --- SEKME YÖNETİMİ ---

// Belirtilen sekmeyi aktif eder ve modülünü yükler
function activateTab(tabId, role) {
    // Sidebar'daki linki bul
    const tabLink = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    
    // Eğer yetkisiz bir alana girmeye çalışıyorsa
    if (tabLink && tabLink.closest('.admin-only') && role !== 'admin') {
        console.warn("Erişim Engellendi: Bu menü sadece adminler içindir.");
        activateTab('dashboard', role);
        return;
    }

    // Görsel olarak menüyü aktif yap
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    if (tabLink) tabLink.classList.add('active');

    // İçeriği Değiştir
    handleTabChange(tabId, role);
}

// Sekme İçeriğini ve Modülünü Yükleyen Fonksiyon
function handleTabChange(target, role) {
    // 1. Tüm section'ları gizle
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    
    // 2. Hedef section'ı bul ve göster
    const targetSection = document.getElementById(`section-${target}`);
    if (targetSection) {
        targetSection.style.display = 'block';
        
        // 3. İlgili modülü başlat
        console.log(`🔄 Modül Yükleniyor: ${target}`);
        
        switch(target) {
            case 'dashboard': 
                DashboardModule.initDashboard(); 
                break;
            case 'users': 
                if(role === 'admin') UserModule.initUsersPage(); 
                break;
            case 'content': 
                ContentModule.initContentPage(); 
                break;
            case 'legislation': 
                if(role === 'admin') LegislationModule.initLegislationPage(); 
                break;
            case 'reports': 
                if(role === 'admin') ReportsModule.initReportsPage(); 
                break;
            case 'exams': 
                ExamsModule.initExamsPage(); 
                break;
            case 'importer': 
                ImporterModule.initImporterPage(); 
                break;
            default:
                console.warn(`Bilinmeyen Modül: ${target}`);
        }
    } else {
        console.warn(`Uyarı: #section-${target} HTML içinde bulunamadı.`);
    }
}

// --- MENÜ VE ETKİLEŞİM YÖNETİMİ ---
function initInteractions(role) {
    // 1. Sidebar Linklerine Tıklama
    // Not: initLayout beklendiği için artık bu elementler kesinlikle sayfada var.
    const tabs = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const href = tab.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript')) return;

            e.preventDefault();
            const target = tab.dataset.tab;

            // URL Hash güncelle
            window.location.hash = target;
            
            // Sekmeyi aç
            activateTab(target, role);

            // Mobilde sidebar açıksa kapat
            closeMobileMenu();
        });
    });

    // 2. Mobil Menü Butonu (Hamburger)
    const mobileBtn = document.getElementById('mobileMenuToggle');
    if(mobileBtn) {
        mobileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Tıklamanın body'ye yayılmasını engelle
            toggleMobileMenu();
        });
    }

    // 3. Sidebar Kapatma Butonu (X)
    const closeBtn = document.getElementById('closeSidebar');
    if(closeBtn) {
        closeBtn.addEventListener('click', closeMobileMenu);
    }

    // 4. Overlay'e tıklayınca kapat
    const overlay = document.getElementById('sidebarOverlay');
    if(overlay) {
        overlay.addEventListener('click', closeMobileMenu);
    }
    
    // 5. Profil Menüsü Toggle
    const userMenuToggle = document.getElementById('userMenuToggle');
    const profileDropdown = document.getElementById('profileDropdown');
    
    if(userMenuToggle && profileDropdown) {
        userMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        });

        // Sayfada başka yere tıklayınca dropdown'ı kapat
        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target) && !userMenuToggle.contains(e.target)) {
                profileDropdown.classList.remove('active');
            }
        });
    }

    // 6. Çıkış Butonu
    const logoutBtn = document.getElementById('logoutBtn'); // Sidebar'daki
    const headerLogoutBtn = document.getElementById('logoutButton'); // Header'daki
    
    const handleLogout = async () => {
        if(confirm("Çıkış yapmak istediğinize emin misiniz?")) {
            // Basit yönlendirme (auth.js halleder veya çıkış işlemi burada yapılabilir)
            window.location.href = "../index.html"; 
        }
    };

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', handleLogout);
}

// --- YARDIMCI FONKSİYONLAR ---

function toggleMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(sidebar && overlay) {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if(sidebar && overlay) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
}

// Header'daki profil bilgilerini günceller
function updateAdminHeaderProfile(user) {
    const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Yönetici');
    const initials = getInitials(displayName);
    const photoUrl = user.photoURL;

    // Helper: Elementi güvenli seç ve güncelle
    const setContent = (id, content) => {
        const el = document.getElementById(id);
        if(el) el.textContent = content;
    };
    
    const setSrc = (id, src) => {
        const el = document.getElementById(id);
        if(el) {
            el.src = src;
            el.style.display = 'block';
        }
    };

    const hide = (id) => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    };

    // İsimleri Yaz
    setContent('dropdownUserName', displayName);
    setContent('dropdownUserEmail', user.email);

    // Avatar Mantığı
    if (photoUrl) {
        setSrc('userAvatarImage', photoUrl);
        setSrc('dropdownAvatarImage', photoUrl);
        hide('userAvatarInitial');
        hide('dropdownAvatarInitial');
    } else {
        setContent('userAvatarInitial', initials);
        setContent('dropdownAvatarInitial', initials);
        hide('userAvatarImage');
        hide('dropdownAvatarImage');
    }
}

function getInitials(name) {
    if (!name) return "G";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
}