import { requireAdminOrEditor } from "./role-guard.js";
import { initLayout } from "./ui-loader.js";

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

let settingsModulePromise = null;
import { initNotifications } from "./modules/admin/notifications.js";
import { showConfirm, showToast } from "./notifications.js";

// --- SAYFA BAŞLANGICI ---
let currentRole = null;
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 1. Arayüzü Yükle
        await initLayout();
        console.log("✅ Arayüz yüklendi.");

        // Bildirim Sistemini Başlat (Sadece Admin Panelinde)
        initNotifications();

        // 2. Yetki Kontrolü
        const { role, user } = await requireAdminOrEditor();
        currentRole = role;
        console.log(`✅ Giriş Başarılı: ${role}`);

        // 3. Kullanıcı Bilgilerini Güncelle
        const roleBadge = document.getElementById('userRoleBadge');
        const sidebarRole = document.getElementById('sidebarUserRole');
        const sidebarName = document.getElementById('sidebarUserName');

        const roleText = role === 'admin' ? 'SİSTEM YÖNETİCİSİ' : 'İÇERİK EDİTÖRÜ';
        if (roleBadge) roleBadge.textContent = roleText;
        if (sidebarRole) sidebarRole.textContent = roleText;
        if (sidebarName) sidebarName.textContent = user.displayName || user.email.split('@')[0];
        updateAdminHeaderProfile(user);

        // --- KRİTİK DÜZELTME BAŞLANGICI ---
        // Admin menülerini yönet
        // Admin menülerini yönet
        const adminElements = document.querySelectorAll('.admin-only');
        if (role === 'admin') {
            // Admin ise gizli menüleri AÇ
            adminElements.forEach(el => {
                if (el.classList.contains('nav-item')) {
                    el.style.display = 'flex';
                } else if (!el.classList.contains('admin-section')) {
                    // Section'lar tab yöneticisi tarafından kontrol edilmeli, burası sadece diğer admin-only elemanları açsın
                    el.style.display = 'block';
                }
            });
        } else {
            // Değilse gizle
            adminElements.forEach(el => el.style.display = 'none');
        }
        // --- KRİTİK DÜZELTME BİTİŞİ ---

        // 4. Global Fonksiyonlar ve Başlatma
        window.openQuestionEditor = ContentModule.openQuestionEditor;
        window.AdminReports = ReportsModule.AdminReports;

        initInteractions(role);

        const initialTab = window.location.hash.substring(1) || 'dashboard';
        activateTab(initialTab, role);

    } catch (error) {
        console.error("Başlatma Hatası:", error);
        showToast(`Panel yüklenirken bir hata oluştu: ${error.message}`, "error");
    }
});

// --- DİĞER FONKSİYONLAR (Aynı kalabilir) ---
function activateTab(tabId, role) {
    const tabLink = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (tabLink && tabLink.closest('.admin-only') && role !== 'admin') {
        activateTab('dashboard', role);
        return;
    }
    document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
    if (tabLink) tabLink.classList.add('active');
    handleTabChange(tabId, role);
}

function handleTabChange(target, role) {
    document.querySelectorAll('.admin-section').forEach(el => el.style.display = 'none');
    const targetSection = document.getElementById(`section-${target}`);
    if (targetSection) {
        targetSection.style.display = 'block';
        // Modülleri başlat
        switch (target) {
            case 'dashboard': DashboardModule.initDashboard(); break;
            case 'users': if (role === 'admin') UserModule.initUsersPage(); break;
            case 'content': ContentModule.initContentPage(); break;
            case 'legislation': if (role === 'admin') LegislationModule.initLegislationPage(); break;
            case 'reports': if (role === 'admin') ReportsModule.initReportsPage(); break;
            case 'exams': ExamsModule.initExamsPage(); break;
            case 'announcements': if (role === 'admin') AnnouncementsModule.initAnnouncementsPage(); break;
            case 'importer': ImporterModule.initImporterPage(); break;
            case 'topics': TopicsModule.initTopicsPage(); break;
            case 'trash': TrashModule.initTrashPage(); break;
            case 'settings': initSettingsModule(); break;
        }
    }
}

async function initSettingsModule() {
    try {
        if (!settingsModulePromise) {
            settingsModulePromise = import("./modules/admin/settings.js");
        }
        const settingsModule = await settingsModulePromise;
        if (typeof settingsModule.init === 'function') {
            await settingsModule.init();
        }
    } catch (error) {
        console.error("Settings modülü yüklenemedi:", error);
        showToast(`Site Ayarları modülü yüklenemedi: ${error.message}`, "error");
    }
}

function initInteractions(role) {
    const tabs = document.querySelectorAll('.sidebar-nav .nav-item[data-tab]');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const href = tab.getAttribute('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript')) return;
            e.preventDefault();
            const target = tab.dataset.tab;
            window.location.hash = target;
            activateTab(target, role);
            closeMobileMenu();
        });
    });

    // Mobil menü ve çıkış işlemleri
    const mobileBtn = document.getElementById('mobileMenuToggle');
    if (mobileBtn) mobileBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMobileMenu(); });
    const closeBtn = document.getElementById('closeSidebar');
    if (closeBtn) closeBtn.addEventListener('click', closeMobileMenu);
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.addEventListener('click', closeMobileMenu);

    // Profil Dropdown
    const userMenuToggle = document.getElementById('userMenuToggle');
    const profileDropdown = document.getElementById('profileDropdown');
    if (userMenuToggle && profileDropdown) {
        userMenuToggle.addEventListener('click', (e) => { e.stopPropagation(); profileDropdown.classList.toggle('active'); });
        document.addEventListener('click', (e) => {
            if (!profileDropdown.contains(e.target) && !userMenuToggle.contains(e.target)) profileDropdown.classList.remove('active');
        });
    }

    // Çıkış Butonları
    const handleLogout = async () => {
        const shouldLogout = await showConfirm("Oturumunuzu kapatmak istediğinize emin misiniz?", {
            title: "Çıkış Onayı",
            confirmText: "Çıkış Yap",
            cancelText: "Vazgeç"
        });
        if (shouldLogout) window.location.href = "../index.html";
    };
    const logoutBtn = document.getElementById('logoutBtn');
    const headerLogoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (headerLogoutBtn) headerLogoutBtn.addEventListener('click', handleLogout);
}

window.addEventListener('hashchange', () => {
    if (!currentRole) return;
    const targetTab = window.location.hash.substring(1) || 'dashboard';
    activateTab(targetTab, currentRole);
});

function toggleMobileMenu() {
    const s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
    if (s && o) { s.classList.toggle('active'); o.classList.toggle('active'); }
}
function closeMobileMenu() {
    const s = document.getElementById('sidebar'), o = document.getElementById('sidebarOverlay');
    if (s && o) { s.classList.remove('active'); o.classList.remove('active'); }
}

function updateAdminHeaderProfile(user) {
    const name = user.displayName || user.email.split('@')[0];
    const elName = document.getElementById('dropdownUserName');
    const elEmail = document.getElementById('dropdownUserEmail');
    if (elName) elName.textContent = name;
    if (elEmail) elEmail.textContent = user.email;
}
