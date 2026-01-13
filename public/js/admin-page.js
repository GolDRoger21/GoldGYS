import { requireAdminOrEditor } from "./role-guard.js";

// --- MODÜL IMPORTLARI ---
import * as DashboardModule from "./modules/admin/dashboard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as LegislationModule from "./modules/admin/legislation.js";
import * as ReportsModule from "./modules/admin/reports.js";
import * as ExamsModule from "./modules/admin/exams.js";      // Yeni: Sınav Modülü
import * as ImporterModule from "./modules/admin/importer.js";  // Yeni: Toplu Yükleme

// --- SAYFA BAŞLANGICI ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 1. GÜVENLİK VE ROL KONTROLÜ
        // Kullanıcı giriş yapmamışsa login'e atar. Yetkisi yoksa 403 verir.
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
        // (Diğer modüllerin HTML içinden çağırabilmesi için window'a atıyoruz)
        window.openQuestionEditor = ContentModule.openQuestionEditor;
        window.AdminReports = ReportsModule.AdminReports;

        // 4. SEKME SİSTEMİNİ BAŞLAT
        initTabs(role);
        
        // URL'de hash varsa (örn: #exams) o sekmeyi aç, yoksa Dashboard'u aç
        const initialTab = window.location.hash.substring(1) || 'dashboard';
        activateTab(initialTab, role);

    } catch (error) {
        console.error("❌ Panel Başlatma Hatası:", error);
        // Hata durumunda içeriği gizle (Güvenlik önlemi)
        document.querySelector('.content-wrapper').style.display = 'none';
        alert("Yetki kontrolü sırasında hata oluştu: " + error.message);
    }
});

// --- SEKME YÖNETİMİ ---

// Belirtilen sekmeyi aktif eder ve modülünü yükler
function activateTab(tabId, role) {
    const tabLink = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    
    // Eğer yetkisiz bir alana girmeye çalışıyorsa (Örn: Editör -> Users)
    if (tabLink && tabLink.closest('.admin-only') && role !== 'admin') {
        console.warn("Erişim Engellendi: Bu menü sadece adminler içindir.");
        activateTab('dashboard', role); // Dashboard'a geri at
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
        
        // 3. İlgili modülün başlatıcı fonksiyonunu çağır (Lazy Load mantığı)
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
        console.error(`Hata: #section-${target} HTML içinde bulunamadı!`);
    }
}

// Sidebar Linklerine Tıklama Olaylarını Ekler
function initTabs(role) {
    const tabs = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const href = tab.getAttribute('href');
            // Eğer normal bir linkse (siteye dön vb.) karışma
            if (href && !href.startsWith('#') && !href.startsWith('javascript')) return;

            e.preventDefault();
            const target = tab.dataset.tab;

            // URL Hash güncelle (Sayfa yenilendiğinde aynı yerde kalsın)
            window.location.hash = target;
            
            // Sekmeyi aç
            activateTab(target, role);

            // Mobilde sidebar açıksa kapat
            if(window.innerWidth < 1024) {
                document.getElementById('sidebar')?.classList.remove('active');
                document.getElementById('sidebarOverlay')?.classList.remove('active');
            }
        });
    });

    // Mobil Menü Butonu (Hamburger)
    const mobileBtn = document.getElementById('mobileMenuToggle');
    if(mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            document.getElementById('sidebar').classList.add('active');
            document.getElementById('sidebarOverlay').classList.add('active');
        });
    }

    // Sidebar Kapatma Butonu (X)
    const closeBtn = document.getElementById('closeSidebar');
    if(closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('active');
            document.getElementById('sidebarOverlay').classList.remove('active');
        });
    }

    // Overlay'e tıklayınca da kapat
    const overlay = document.getElementById('sidebarOverlay');
    if(overlay) {
        overlay.addEventListener('click', () => {
            document.getElementById('sidebar').classList.remove('active');
            overlay.classList.remove('active');
        });
    }
    
    // Çıkış Butonu
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if(confirm("Çıkış yapmak istediğinize emin misiniz?")) {
                try {
                    // Firebase auth import edilmediyse window üzerinden veya role-guard'dan gelebilir
                    // Burada basitçe href yönlendirmesi yapıyoruz, auth.js logout'u halleder
                    window.location.href = "../index.html"; 
                    // Not: Gerçek logout işlemi için auth modülünü import edip signOut() çağırmak daha iyidir.
                } catch(e) {
                    console.error(e);
                }
            }
        });
    }
}

// --- YARDIMCI FONKSİYONLAR ---

// Header'daki profil bilgilerini günceller
function updateAdminHeaderProfile(user) {
    const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Yönetici');
    const initials = getInitials(displayName);
    const photoUrl = user.photoURL;

    // Elementleri güvenli şekilde seç (Bazıları sayfada olmayabilir)
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
        // Fotoğraf varsa
        setSrc('userAvatarImage', photoUrl);
        setSrc('dropdownAvatarImage', photoUrl);
        hide('userAvatarInitial');
        hide('dropdownAvatarInitial');
    } else {
        // Fotoğraf yoksa Baş Harf
        setContent('userAvatarInitial', initials);
        setContent('dropdownAvatarInitial', initials);
        hide('userAvatarImage');
        hide('dropdownAvatarImage');
    }
}

// İsimden baş harfleri çıkarır (Ahmet Yılmaz -> AY)
function getInitials(name) {
    if (!name) return "G";
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
}