// public/js/admin-page.js

// 1. Modül ve Altyapı Importları
import { requireAdminOrEditor } from "./role-guard.js";
import { initLayout } from "./ui-loader.js";

// Admin Alt Modülleri (İçerik Yönetimi)
import * as DashboardModule from "./modules/admin/dashboard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as LegislationModule from "./modules/admin/legislation.js";
import * as ReportsModule from "./modules/admin/reports.js";
import * as ExamsModule from "./modules/admin/exams.js";
// Importer artık ayrı bir HTML sayfası olduğu için buradan import edilmesine gerek yok.

// 2. Sayfa Başlangıcı
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // A. Arayüzü ve Menüleri Yükle
        // (Header, Sidebar, Profil Resmi, Logout vb. ui-loader tarafından halledilir)
        await initLayout();
        console.log("✅ Admin Arayüzü Başlatıldı.");

        // B. Yetki Kontrolü
        // Bu sayfa kritik olduğu için tekrar rol kontrolü yapıyoruz.
        const { role } = await requireAdminOrEditor();
        console.log(`✅ Yetki Onaylandı: ${role}`);

        // C. Tab Sistemini Başlat (Navigasyon)
        initTabs(role);

        // D. Başlangıç Tabını Aç (URL hash'ine göre #users, #content vb.)
        const initialTab = window.location.hash.substring(1) || 'dashboard';
        activateTab(initialTab, role);

        // E. Global Fonksiyonları Tanımla (HTML içindeki onclick butonları için)
        window.openQuestionEditor = ContentModule.openQuestionEditor;
        window.AdminReports = ReportsModule.AdminReports;

    } catch (error) {
        console.error("❌ Admin Sayfası Hatası:", error);
        // Kritik hata varsa ui-loader zaten login'e yönlendirmiş olabilir.
    }
});

// --- YARDIMCI FONKSİYONLAR ---

/**
 * Sidebar linklerine tıklamayı ve Hash değişimini dinler.
 */
function initTabs(role) {
    // 1. Sidebar Link Tıklamaları
    const links = document.querySelectorAll('.sidebar-nav .nav-link, .sidebar-nav .nav-item');
    
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            
            // Eğer link bir iç sayfa (Tab) ise (#dashboard gibi)
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const tabId = href.substring(1);
                
                // URL Hash'ini güncelle (Bu, hashchange olayını tetikler)
                window.location.hash = tabId;
                
                // Mobildeysek sidebar'ı kapat
                closeMobileMenu();
            }
            // Normal link ise (/admin/importer.html gibi) tarayıcı normal yönlensin.
        });
    });

    // 2. Tarayıcı Geri/İleri Tuşları İçin Hash Kontrolü
    window.addEventListener('hashchange', () => {
        const tabId = window.location.hash.substring(1);
        if (tabId) activateTab(tabId, role);
    });
}

/**
 * İlgili sekmeyi (Section) görünür yapar ve modülünü çalıştırır.
 */
function activateTab(tabId, role) {
    // Link Aktifliği (CSS)
    document.querySelectorAll('.nav-link, .nav-item').forEach(l => l.classList.remove('active'));
    
    // Hem nav-link hem nav-item desteği (farklı HTML yapılarına uyum için)
    const activeLink = document.querySelector(`.nav-link[href="#${tabId}"]`) || 
                       document.querySelector(`.nav-item[href="#${tabId}"]`);
    
    if (activeLink) activeLink.classList.add('active');

    // Section Görünürlüğü
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none');
    
    const targetSection = document.getElementById(`section-${tabId}`);
    if (targetSection) {
        targetSection.style.display = 'block';
        
        // İlgili modülün JS kodlarını çalıştır (Lazy Execution)
        loadModuleData(tabId, role);
        updatePageTitle(tabId);
    } else {
        // Geçersiz bir hash ise varsayılan olarak dashboard'u aç
        if (tabId !== 'dashboard') {
            console.warn(`Section bulunamadı: ${tabId}, Dashboard'a yönlendiriliyor.`);
            activateTab('dashboard', role);
        }
    }
}

function updatePageTitle(tabId) {
    const titles = {
        dashboard: 'Genel Bakış',
        users: 'Üye Yönetimi',
        content: 'Konu ve Ders Yönetimi',
        exams: 'Sınav Yönetimi',
        reports: 'Bildirimler',
        legislation: 'Mevzuat Yönetimi'
    };

    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        pageTitle.textContent = titles[tabId] || 'Yönetim Paneli';
    }

    const breadcrumbCurrent = document.getElementById('pageBreadcrumbCurrent');
    if (breadcrumbCurrent) {
        breadcrumbCurrent.textContent = titles[tabId] || 'Yönetim Paneli';
    }
}

/**
 * Tab açıldığında ilgili verileri yükleyen fonksiyon.
 */
function loadModuleData(tabId, role) {
    switch(tabId) {
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
        default:
            break;
    }
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth < 1024) {
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    }
}
