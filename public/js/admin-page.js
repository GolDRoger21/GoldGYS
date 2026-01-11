// public/js/admin-page.js
import { auth } from "./firebase-config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { requireAdminOrEditor } from "./role-guard.js";

// DOM Elementleri
const dom = {
    roleBadge: document.getElementById("userRoleBadge"),
    adminName: document.getElementById("adminName"),
    adminAvatar: document.getElementById("adminAvatar"),
    logoutBtn: document.getElementById("logoutBtn"),
    menuItems: document.querySelectorAll(".menu-item"),
    adminOnlyElements: document.querySelectorAll(".admin-only"),
    pageTitle: document.getElementById("pageTitle"),
    contentArea: document.getElementById("contentArea")
};

// Sayfa Başlatma
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // 1. Güvenlik Kontrolü
        const { role, user } = await requireAdminOrEditor();
        console.log(`Admin paneline erişim sağlandı. Rol: ${role}`);

        // 2. Arayüzü Rol'e Göre Düzenle
        setupUI(role, user);

        // 3. Olay Dinleyicileri
        setupEventListeners();

    } catch (error) {
        console.error("Erişim reddedildi:", error);
        // requireAdminOrEditor zaten yönlendirme yapıyor
    }
});

function setupUI(role, user) {
    // Profil Bilgileri
    const name = user.displayName || user.email.split('@')[0];
    dom.adminName.textContent = name;
    dom.roleBadge.textContent = role === "admin" ? "YÖNETİCİ" : "EDİTÖR";
    
    // Avatar
    if (user.photoURL) {
        dom.adminAvatar.src = user.photoURL;
    }

    // Rol Kısıtlamaları
    if (role !== "admin") {
        // Editör ise, 'admin-only' sınıfına sahip elementleri gizle
        dom.adminOnlyElements.forEach(el => el.classList.add("hidden"));
    }
}

function setupEventListeners() {
    // Çıkış Yap
    dom.logoutBtn.addEventListener("click", async () => {
        if(confirm("Yönetim panelinden çıkmak istiyor musunuz?")) {
            await signOut(auth);
            window.location.href = "/login.html";
        }
    });

    // Menü Geçişleri (SPA Mantığı)
    dom.menuItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            
            // Aktif sınıfını güncelle
            dom.menuItems.forEach(i => i.classList.remove("active"));
            item.classList.add("active");

            // Başlığı güncelle
            const target = item.getAttribute("data-target");
            const title = item.innerText;
            dom.pageTitle.textContent = title;

            // İçeriği Yükle
            loadContent(target);
        });
    });
}

// Basit İçerik Yükleyici (İleride modüllerden import edilecek)
function loadContent(target) {
    // Burası ileride `modules/admin/users.js` gibi dosyalardan render fonksiyonlarını çağıracak.
    // Şimdilik sadece demo amaçlı basit HTML değiştiriyoruz.

    if (target === "dashboard") {
        // Mevcut dashboard yapısını geri yükle (veya sayfayı yenilemeden göster)
        window.location.reload(); 
        return;
    }

    let html = "";
    if (target === "users") {
        html = `
            <div class="recent-activity">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h3>Kullanıcı Listesi</h3>
                    <button class="badge success" style="border:none; cursor:pointer; font-size:14px; padding:8px 16px;">+ Yeni Kullanıcı</button>
                </div>
                <p style=\"color:#94a3b8;\">Kullanıcı yönetimi modülü hazırlanıyor...</p>
            </div>
        `;
    } else if (target === "tests") {
        html = `
            <div class="recent-activity">
                <h3>Test Yönetimi</h3>
                <p style=\"color:#94a3b8;\">Soru bankası ve test oluşturma araçları buraya gelecek.</p>
            </div>
        `;
    } else {
        html = `<div class="stat-card"><h3>${target}</h3><p>Bu modül yapım aşamasında.</p></div>`;
    }

    dom.contentArea.innerHTML = html;
}