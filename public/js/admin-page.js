
import { auth } from "./firebase-config.js"; // Düzeltildi: ../ yerine ./
import { requireAdminOrEditor } from "./role-guard.js"; // Düzeltildi: ../ yerine ./
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as LegislationModule from "./modules/admin/legislation.js";
// Yeni modülleri import ediyoruz (aşağıda oluşturacağız)
import * as DashboardModule from "./modules/admin/dashboard.js";
import * as ReportsModule from "./modules/admin/reports.js"; 

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const { role } = await requireAdminOrEditor();
        console.log(`Admin Paneli Başlatıldı. Rol: ${role}`);
        
        if (role !== 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        }

        // Header User Info güncelle
        const userEmailEl = document.getElementById('headerUserEmail');
        if (userEmailEl && auth.currentUser) {
            userEmailEl.textContent = auth.currentUser.email;
        }

        window.openQuestionEditor = ContentModule.openQuestionEditor;
        // Global Reports objesini de pencereye ekleyelim (Silme/Arşivleme işlemleri için)
        window.AdminReports = ReportsModule.AdminReports; 

        initTabs(role);
        
        // URL hash kontrolü (örn: #users direkt o sekmeyi açar) veya varsayılan dashboard
        const initialTab = window.location.hash.substring(1) || 'dashboard';
        handleTabChange(initialTab, role);
        // Sayfa yüklendiğinde doğru menü öğesini aktif hale getir
        const activeTabEl = document.querySelector(`.nav-item[data-tab="${initialTab}"]`);
        if(activeTabEl) activeTabEl.classList.add('active');


    } catch (error) {
        console.error("Başlatma hatası:", error);
    }
});

function initTabs(role) {
    const tabs = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const target = tab.dataset.tab;
            
            // Aktif tab görselini güncelle
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // URL hash'ini güncelle
            window.location.hash = target;

            handleTabChange(target, role);
        });
    });
}

function handleTabChange(target, role) {
    // Tüm bölümleri gizle
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    
    // Hedef bölümü göster
    const targetSection = document.getElementById(`section-${target}`);
    if(targetSection) {
        targetSection.style.display = 'block';
    } else {
        console.warn(`Bölüm bulunamadı: section-${target}`);
        return;
    }

    // İlgili modülü çalıştır
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
            LegislationModule.initLegislationPage();
            break;
        case 'reports':
            ReportsModule.initReportsPage();
            break;
        default:
            console.log(`${target} modülü henüz aktif değil.`);
    }
}

// Logout
const logoutBtn = document.getElementById('logoutBtn');
if(logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => window.location.href = '/login.html');
    });
}
