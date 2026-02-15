import { requireAdminOrEditor } from "../../role-guard.js";

const TAB_CONTENT = {
    general: "Genel ayarlar yakında.",
    seo: "SEO ayarları yakında.",
    features: "Özellik bayrakları yakında.",
    examRules: "Sınav kuralları ayarları yakında.",
    system: "Sistem ayarları yakında."
};

/**
 * TODO (Step 2+): Firestore schema plan
 * collection: config
 *
 * doc: public
 * {
 *   "branding": {
 *     "siteName": "Gold GYS",
 *     "logoUrl": "https://...",
 *     "primaryColor": "#1f6feb"
 *   },
 *   "contact": {
 *     "email": "destek@example.com",
 *     "phone": "+90...",
 *     "address": "İstanbul"
 *   },
 *   "seo": {
 *     "title": "Gold GYS - Hazırlık Platformu",
 *     "description": "...",
 *     "keywords": ["gys", "hazırlık", "sınav"]
 *   }
 * }
 *
 * doc: featureFlags
 * {
 *   "announcementsEnabled": true,
 *   "examModuleEnabled": true,
 *   "betaFeatures": {
 *     "newDashboard": false
 *   }
 * }
 *
 * doc: examRules
 * {
 *   "defaultDurationMinutes": 60,
 *   "passScore": 70,
 *   "negativeMarking": false,
 *   "maxAttempts": 3
 * }
 *
 * doc: system
 * {
 *   "maintenanceMode": false,
 *   "allowRegistrations": true,
 *   "lastUpdatedBy": "uid",
 *   "lastUpdatedAt": "serverTimestamp"
 * }
 */

export async function init() {
    await requireAdminOrEditor();

    const section = document.getElementById("section-settings");
    if (!section) return;

    const response = await fetch("/admin/settings.html", { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Ayarlar görünümü yüklenemedi (HTTP ${response.status})`);
    }

    section.innerHTML = await response.text();
    setSidebarActive();
    bindTabSwitching();
}

function setSidebarActive() {
    document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => {
        item.classList.remove("active");
    });

    const settingsItem = document.querySelector('.sidebar-nav .nav-item[data-tab="settings"]');
    if (settingsItem) {
        settingsItem.classList.add("active");
    }
}

function bindTabSwitching() {
    const tabButtons = document.querySelectorAll("[data-settings-tab]");
    const content = document.getElementById("settingsTabContent");
    if (!tabButtons.length || !content) return;

    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const tabKey = button.dataset.settingsTab;
            tabButtons.forEach((btn) => {
                btn.classList.remove("btn-primary");
                btn.classList.add("btn-outline-secondary");
            });
            button.classList.remove("btn-outline-secondary");
            button.classList.add("btn-primary");

            content.textContent = TAB_CONTENT[tabKey] || "Bu alan yakında aktif olacak.";
        });
    });
}
