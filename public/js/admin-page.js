
import { auth } from "../firebase-config.js";
import { requireAdminOrEditor } from "../role-guard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as StatsModule from "./modules/admin/utils.js";
import * as LegislationModule from "./modules/admin/legislation.js";

// Sayfa yüklendiğinde yetki kontrolü yap ve paneli başlat
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const { role } = await requireAdminOrEditor();
        console.log(`Admin Paneli Başlatıldı. Rol: ${role}`);
        
        // Rol tabanlı UI düzenlemesi
        if (role !== 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        }

        // Modüller arası iletişim için global fonksiyonu ata
        window.openQuestionEditor = ContentModule.openQuestionEditor;

        initTabs(role);

        // Header User Info güncelle
        const userEmailEl = document.getElementById('headerUserEmail');
        if (userEmailEl && auth.currentUser) {
            userEmailEl.textContent = auth.currentUser.email;
        }

        // Varsayılan olarak Dashboard açılsın
        handleTabChange('dashboard', role);

    } catch (error) {
        console.error("Yetki veya başlatma hatası:", error);
        // Kullanıcıyı login sayfasına yönlendir veya hata göster
        // window.location.href = '/login.html';
    }
});

function initTabs(role) {
    const tabs = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.dataset.tab;
            handleTabChange(target, role);
        });
    });
}

function handleTabChange(target, role) {
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    
    const targetSection = document.getElementById(`section-${target}`);
    if(targetSection) targetSection.style.display = 'block';

    // İlgili modülün başlatma fonksiyonunu çağır
    switch(target) {
        case 'users':
            if(role === 'admin') UserModule.initUsersPage();
            break;
        case 'content':
            ContentModule.initContentPage();
            break;
        case 'dashboard':
            // StatsModule.loadDashboardStats(); // Gerekirse
            break;
        case 'legislation':
            LegislationModule.initLegislationPage();
            break;
        // case 'reports':
        //     ReportsModule.initReportsPage();
        //     break;
    }
}

// Logout butonu
document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.signOut().then(() => {
        window.location.href = '/login.html';
    });
});
