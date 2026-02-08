import { requireAdminOrEditor } from "./role-guard.js";

// --- MODÜL IMPORTLARI ---
import * as DashboardModule from "./modules/admin/dashboard.js";
import * as UserModule from "./modules/admin/users.js";
import * as ContentModule from "./modules/admin/content.js";
import * as LegislationModule from "./modules/admin/legislation.js";
import * as ReportsModule from "./modules/admin/reports.js";
import * as ExamsModule from "./modules/admin/exams.js";
import * as AnnouncementsModule from "./modules/admin/announcements.js";
import * as ImporterModule from "./modules/admin/importer.js";
import * as TopicsModule from "./modules/admin/topics.js";
import * as TrashModule from "./modules/admin/trash.js";
import * as MaintenanceModule from "./modules/admin/maintenance.js";
import { initNotifications } from "./modules/admin/notifications.js";
import { showConfirm, showToast } from "./notifications.js";

// --- SAYFA BAŞLANGICI ---
let currentRole = null;
let abortController = null; // Event listener yönetimi için
let hashChangeListener = null; // Hash change listener referansı


export async function mount() {
    console.log("🚀 Admin Page Mount Started");

    // Temizlik ve Hazırlık
    if (abortController) abortController.abort();
    abortController = new AbortController();
    const signal = { signal: abortController.signal };

    try {
        // Bildirim Sistemini Başlat (Sadece Admin Panelinde)
        // Not: initNotifications içinde de listener varsa oraya da signal geçmek gerekebilir ama şimdilik kalsın.
        initNotifications();

        // 1. Yetki Kontrolü
        const { role, user } = await requireAdminOrEditor();
        currentRole = role;
        console.log(`✅ Giriş Başarılı: ${role}`);

        // 2. Kullanıcı Bilgilerini Güncelle
        const roleBadge = document.getElementById('userRoleBadge');
        const sidebarRole = document.getElementById('sidebarUserRole');
        const sidebarName = document.getElementById('sidebarUserName');

        const roleText = role === 'admin' ? 'SİSTEM YÖNETİCİSİ' : 'İÇERİK EDİTÖRÜ';
        if (roleBadge) roleBadge.textContent = roleText;
        if (sidebarRole) sidebarRole.textContent = roleText;
        if (sidebarName) sidebarName.textContent = user.displayName || user.email.split('@')[0];
        updateAdminHeaderProfile(user);

        // --- MENÜ YÖNETİMİ ---
        const adminElements = document.querySelectorAll('.admin-only');
        if (role === 'admin') {
            adminElements.forEach(el => {
                if (el.classList.contains('nav-item')) {
                    el.style.display = 'flex';
                } else if (!el.classList.contains('admin-section')) {
                    el.style.display = 'block';
                }
            });
        } else {
            adminElements.forEach(el => el.style.display = 'none');
        }

        // 3. Global Fonksiyonlar (Eski sistem uyumluluğu için)
        window.openQuestionEditor = ContentModule.openQuestionEditor;
        window.AdminReports = ReportsModule.AdminReports;

        initInteractions(role, signal);

        // 4. Hash Change Listener (Cleanup için referanslı)
        hashChangeListener = () => {
            if (!currentRole) return;
            const targetTab = window.location.hash.substring(1) || 'dashboard';
            activateTab(targetTab, currentRole);
        };
        window.addEventListener('hashchange', hashChangeListener); // Signal desteklemiyor olabilir, manuel sileriz.

        // İlk Tab'ı Yükle
        const initialTab = window.location.hash.substring(1) || 'dashboard';
        activateTab(initialTab, role);

    } catch (error) {
        console.error("Master Init Hatası:", error);
        showToast(`Panel yüklenirken bir hata oluştu: ${error.message}`, "error");
    }
}

export function unmount() {
    console.log("🧹 Admin Page Unmount");


    // 1. Event Listener'ları Temizle
    if (abortController) {
        abortController.abort();
        abortController = null;
    }

    if (hashChangeListener) {
        window.removeEventListener('hashchange', hashChangeListener);
        hashChangeListener = null;
    }

    // 2. Global Referansları Temizle
    delete window.openQuestionEditor;
    delete window.AdminReports;

    // 3. Alt Modül Temizlikleri
    if (DashboardModule.cleanup) {
        try {
            DashboardModule.cleanup();
        } catch (e) {
            console.warn("DashboardModule cleanup error:", e);
        }
    }
}

// --- DİĞER FONKSİYONLAR ---
function activateTab(tabId, role) {
    const tabLink = document.querySelector(`.nav-item[data-tab="${tabId}"]`);

    // Yetki kontrolü (Admin only tab'a editör girmeye çalışırsa)
    if (tabLink && tabLink.closest('.admin-only') && role !== 'admin') {
        window.location.hash = 'dashboard';
        return;
    }

    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    if (tabLink) tabLink.classList.add('active');

    handleTabChange(tabId, role);
}

function handleTabChange(target, role) {
    // Tüm sectionları gizle
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');

    const targetSection = document.getElementById(`section-${target}`);
    if (targetSection) {
        targetSection.style.display = 'block';

        // İlgili modülü başlat
        switch (target) {
            case 'dashboard': DashboardModule.initDashboard(); break;
            case 'users': if (role === 'admin') UserModule.initUsersPage(); break;
            case 'content': ContentModule.initContentPage(); break;
            case 'legislation': if (role === 'admin') LegislationModule.initLegislationPage(); break;
            case 'reports':
                if (role === 'admin') {
                    ReportsModule.initReportsPage().catch(e => {
                        console.error("Rapor sayfası yüklenirken hata (Async):", e);
                        const el = document.getElementById('reportsList');
                        if (el) el.innerHTML = `<div class="alert alert-danger">Raporlar yüklenemedi: ${e.message}</div>`;
                    });
                }
                break;
            case 'exams': ExamsModule.initExamsPage(); break;
            case 'announcements': if (role === 'admin') AnnouncementsModule.initAnnouncementsPage(); break;
            case 'importer': ImporterModule.initImporterPage(); break;
            case 'topics': TopicsModule.initTopicsPage(); break;
            case 'trash': TrashModule.initTrashPage(); break;
            case 'maintenance':
                if (role === 'admin') {
                    try {
                        MaintenanceModule.initMaintenancePage();
                    } catch (e) {
                        console.error("Bakım sayfası yüklenirken hata:", e);
                        const el = document.getElementById('section-maintenance');
                        if (el) el.innerHTML = '<div class="alert alert-danger">Bakım modülü yüklenemedi.</div>';
                    }
                }
                break;
        }
    }
}

function initInteractions(role, { signal }) {
    // 1. Sidebar Tabları
    const tabs = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const href = tab.getAttribute('href');
            // Eğer href varsa ve anchor link değilse (#) normal navigasyona bırak (SPA router halleder veya dış link)
            if (href && !href.startsWith('#') && !href.startsWith('javascript')) return; // Örneğin Logout

            e.preventDefault();
            const target = tab.dataset.tab;
            window.location.hash = target;
            // hashchange listener tetikleyecek, manuel çağırmaya gerek yok (çift yüklemeyi önlemek için)
            closeMobileMenu();
        }, { signal });
    });

    // 2. Mobil Menü Toggle
    const mobileBtn = document.getElementById('mobileMenuToggle');
    if (mobileBtn) {
        mobileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMobileMenu();
        }, { signal });
    }

    // 3. Mobil Menü Kapatma (X butonu ve Overlay)
    const closeBtn = document.getElementById('closeSidebar');
    if (closeBtn) closeBtn.addEventListener('click', closeMobileMenu, { signal });

    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.addEventListener('click', closeMobileMenu, { signal });

    // 4. Profil Dropdown
    const userMenuToggle = document.getElementById('userMenuToggle');
    const profileDropdown = document.getElementById('profileDropdown');
    if (userMenuToggle && profileDropdown) {
        userMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        }, { signal });

        // Dışarı tıklama - Document seviyesi olduğu için signal ile temizlenmesi önemli
        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target) && !userMenuToggle.contains(e.target)) {
                profileDropdown.classList.remove('active');
            }
        }, { signal });
    }

    // 5. Çıkış Butonları
    const handleLogout = async () => {
        const shouldLogout = await showConfirm("Oturumunuzu kapatmak istediğinize emin misiniz?", {
            title: "Çıkış Onayı",
            confirmText: "Çıkış Yap",
            cancelText: "Vazgeç"
        });
        if (shouldLogout) window.location.href = "../index.html"; // veya signOut
    };

    const logoutBtn = document.getElementById('logoutBtn'); // Sidebar'daki
    const headerLogoutBtn = document.getElementById('logoutButton'); // Header'daki

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout, { signal });
    if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', handleLogout, { signal });
}

function toggleMobileMenu() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebarOverlay');
    if (s) s.classList.toggle('active');
    if (o) o.classList.toggle('active');
}

function closeMobileMenu() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebarOverlay');
    if (s) s.classList.remove('active');
    if (o) o.classList.remove('active');
}

function updateAdminHeaderProfile(user) {
    const name = user.displayName || user.email.split('@')[0];
    const elName = document.getElementById('dropdownUserName');
    const elEmail = document.getElementById('dropdownUserEmail');
    if (elName) elName.textContent = name;
    if (elEmail) elEmail.textContent = user.email;
}
