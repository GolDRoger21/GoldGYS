
import { auth } from "../firebase-config.js";
import { requireAdminOrEditor } from "../role-guard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as StatsModule from "./modules/admin/utils.js"; // İstatistikler utils içinde olabilir

// Sayfa yüklendiğinde yetki kontrolü yap ve paneli başlat
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const { role } = await requireAdminOrEditor();
        console.log(`Admin Paneli Başlatıldı. Rol: ${role}`);
        
        // Rol tabanlı UI düzenlemesi (Editör ise Üye Yönetimini gizle)
        if (role === 'editor') {
            document.querySelector('[data-tab="users"]').style.display = 'none';
        }

        initTabs(role);
        // Varsayılan olarak Dashboard (İstatistikler) açılsın
        loadDashboardStats(); 

    } catch (error) {
        console.error("Yetki hatası:", error);
    }
});

function initTabs(role) {
    const tabs = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Aktif class yönetimi
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const target = tab.dataset.tab;
            handleTabChange(target, role);
        });
    });
}

function handleTabChange(target, role) {
    // Tüm içerik alanlarını gizle
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    
    // Hedef alanı göster
    const targetSection = document.getElementById(`section-${target}`);
    if(targetSection) targetSection.style.display = 'block';

    // Modülü yükle
    switch(target) {
        case 'users':
            if(role === 'admin') UserModule.initUsersPage();
            break;
        case 'content':
            ContentModule.initContentPage();
            break;
        case 'dashboard':
            loadDashboardStats();
            break;
    }
}

async function loadDashboardStats() {
    // Burada basit sayaçları güncelleyeceğiz
    // StatsModule.getSummary()...
}
