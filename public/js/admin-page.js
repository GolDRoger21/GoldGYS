// public/js/admin-page.js

// --- MODÜL VE KÜTÜPHANE IMPORTLARI ---
import { requireAdminOrEditor } from "./role-guard.js";
import { initLayout } from "./ui-loader.js";
import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Admin Modülleri
import * as DashboardModule from "./modules/admin/dashboard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as LegislationModule from "./modules/admin/legislation.js";
import * as ReportsModule from "./modules/admin/reports.js";
import * as ExamsModule from "./modules/admin/exams.js";
import * as ImporterModule from "./modules/admin/importer.js";

// --- SAYFA BAŞLANGICI ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 1. Arayüzü Yükle (Sidebar, Header placeholder vb.)
        await initLayout(); 
        console.log("✅ Arayüz yüklendi.");

        // 2. Yetki Kontrolü (Admin veya Editör mü?)
        const { role, user } = await requireAdminOrEditor();
        console.log(`✅ Giriş Başarılı: ${role}`);

        // 3. Kullanıcı Bilgilerini Header ve Sidebar'a İşle
        updateProfileUI(user, role);

        // 4. Admin/Editör Menü Ayrımı (KRİTİK KISIM)
        const adminElements = document.querySelectorAll('.admin-only');
        if (role === 'admin') {
            adminElements.forEach(el => el.classList.remove('hidden')); // CSS class ile yönetmek daha sağlıklı
            adminElements.forEach(el => el.style.display = 'block');    // Garanti olsun diye inline style
        } else {
            adminElements.forEach(el => el.classList.add('hidden'));
            adminElements.forEach(el => el.style.display = 'none');
        }

        // 5. Global Fonksiyonları Tanımla
        window.openQuestionEditor = ContentModule.openQuestionEditor;
        window.AdminReports = ReportsModule.AdminReports;

        // 6. Başlangıç Ayarları
        initTheme();
        initSidebarInteractions(role);
        
        // İlk açılışta hangi tab görünecek?
        const initialTab = window.location.hash.substring(1) || 'dashboard';
        activateTab(initialTab, role);

    } catch (error) {
        console.error("Başlatma Hatası:", error);
        // Hata durumunda login'e atılabilir veya uyarı verilebilir
        if(error.message.includes("yetki") || error.message.includes("Giriş")) {
            window.location.href = '/public/login.html';
        }
    }
});

// --- HEADER YÖNETİMİ (Yeni Tasarıma Uygun) ---

// 1. Menüyü Aç/Kapa (HTML onclick="toggleUserMenu()" bunu çağırır)
window.toggleUserMenu = function() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
        dropdown.style.display = isHidden ? 'flex' : 'none'; // Flex kullandık çünkü CSS'te flex tanımlı
    }
};

// 2. Dışarı Tıklayınca Menüyü Kapat
document.addEventListener('click', function(event) {
    const container = document.querySelector('.user-menu-container');
    const dropdown = document.getElementById('userDropdown');
    
    // Tıklanan yer menü değilse ve menü açıksa kapat
    if (container && !container.contains(event.target) && dropdown && dropdown.style.display !== 'none') {
        dropdown.style.display = 'none';
    }
});

// 3. Güvenli Çıkış Yap
window.handleLogout = async function() {
    if(confirm("Yönetim panelinden çıkış yapmak istiyor musunuz?")) {
        try {
            const auth = getAuth();
            await signOut(auth);
            window.location.href = '/public/login.html';
        } catch (error) {
            console.error("Çıkış hatası:", error);
            alert("Çıkış sırasında hata oluştu.");
        }
    }
};

// --- YARDIMCI FONKSİYONLAR ---

function updateProfileUI(user, role) {
    // Header Bilgileri (Yeni Header ID'leri)
    const headerName = document.getElementById('dropdownUserName');
    const headerEmail = document.getElementById('dropdownUserEmail');
    const headerImg = document.getElementById('headerAvatarImg');
    
    const displayName = user.displayName || user.email.split('@')[0];

    if (headerName) headerName.textContent = displayName;
    if (headerEmail) headerEmail.textContent = role === 'admin' ? `Yönetici (${user.email})` : `Editör (${user.email})`;
    if (headerImg && user.photoURL) headerImg.src = user.photoURL;

    // Sidebar'daki Badge (Eğer varsa)
    const sidebarBadge = document.querySelector('.badge-admin');
    if (sidebarBadge) sidebarBadge.textContent = role === 'admin' ? 'Admin' : 'Editör';
}

function initTheme() {
    const themeToggle = document.querySelector('[data-theme-toggle]');
    const body = document.body;
    const savedTheme = localStorage.getItem('theme');
    
    if (savedTheme === 'light') body.classList.add('light-mode');
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            body.classList.toggle('light-mode');
            localStorage.setItem('theme', body.classList.contains('light-mode') ? 'light' : 'dark');
        });
    }
}

function initSidebarInteractions(role) {
    // Sidebar Tab Geçişleri
    const tabs = document.querySelectorAll('.sidebar-nav .nav-link'); // Class ismini nav-link olarak güncelledik
    
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const href = tab.getAttribute('href');
            // Eğer gerçek bir link ise (../pages/dashboard.html gibi) yönlendirmesine izin ver
            if (href && !href.includes('#') && !href.startsWith('javascript')) return;

            // Hash link ise (#users, #dashboard) SPA mantığı çalışsın
            e.preventDefault();
            const target = href ? href.substring(1) : tab.dataset.tab; // href="#users" -> users
            
            // Link admin-only ise ve kullanıcı admin değilse engelle
            if(tab.closest('.admin-only') && role !== 'admin') {
                alert("Bu alana erişim yetkiniz yok.");
                return;
            }

            if(target) {
                window.location.hash = target;
                activateTab(target, role);
                
                // Mobildeysek menüyü kapat
                if(window.innerWidth <= 1024) {
                    const sidebar = document.querySelector('.sidebar');
                    if(sidebar) sidebar.classList.remove('active');
                }
            }
        });
    });

    // Mobil Sidebar Toggle (Header'daki Hamburger Menü)
    const mobileToggle = document.getElementById('sidebar-toggle');
    if(mobileToggle) {
        mobileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const sidebar = document.querySelector('.sidebar');
            if(sidebar) sidebar.classList.toggle('active');
        });
    }

    // Sidebar dışına tıklayınca kapat (Mobil için)
    document.addEventListener('click', (e) => {
        if(window.innerWidth <= 1024) {
            const sidebar = document.querySelector('.sidebar');
            const toggleBtn = document.getElementById('sidebar-toggle');
            if(sidebar && sidebar.classList.contains('active') && !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        }
    });
}

function activateTab(tabId, role) {
    // Önceki aktif tabı temizle
    document.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
    
    // Yeni tabı aktif yap
    // Hem href="#tabId" hem de data-tab="tabId" desteği
    const activeLink = document.querySelector(`.nav-link[href="#${tabId}"]`) || document.querySelector(`.nav-link[data-tab="${tabId}"]`);
    if (activeLink) activeLink.classList.add('active');

    // İçerik Alanlarını Yönet
    handleTabChange(tabId, role);
}

function handleTabChange(target, role) {
    // Tüm sectionları gizle
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    
    // Hedef sectionı bul
    // HTML'de sectionların id'si genellikle "section-dashboard", "section-users" şeklindedir
    let targetSection = document.getElementById(`section-${target}`);
    
    // Eğer section yoksa (henüz yüklenmediyse veya 404), dashboard'a dön
    if (!targetSection && target !== 'dashboard') {
        console.warn(`Section bulunamadı: ${target}`);
        return;
    }

    if (targetSection) {
        targetSection.style.display = 'block';
        
        // Modülleri Lazy Load mantığıyla başlat
        switch(target) {
            case 'dashboard': DashboardModule.initDashboard(); break;
            case 'users': if(role==='admin') UserModule.initUsersPage(); break;
            case 'content': ContentModule.initContentPage(); break;
            case 'legislation': if(role==='admin') LegislationModule.initLegislationPage(); break;
            case 'reports': if(role==='admin') ReportsModule.initReportsPage(); break;
            case 'exams': ExamsModule.initExamsPage(); break;
            case 'importer': ImporterModule.initImporterPage(); break;
            default: break;
        }
    }
}