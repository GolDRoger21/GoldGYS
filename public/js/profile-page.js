// public/js/profile-page.js
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elementleri
const dom = {
    // Layout
    sidebar: document.getElementById("sidebar"),
    sidebarOverlay: document.getElementById("sidebarOverlay"),
    menuToggle: document.getElementById("menuToggle"),
    closeSidebar: document.getElementById("closeSidebar"),
    logoutBtn: document.getElementById("logoutBtn"),
    
    // Header & Avatar
    headerAvatar: document.getElementById("headerAvatar"),
    profileAvatarMain: document.getElementById("profileAvatarMain"),
    profileNameMain: document.getElementById("profileNameMain"),
    profileRoleMain: document.getElementById("profileRoleMain"),
    
    // Form Inputs
    inpAd: document.getElementById("inpAd"),
    inpSoyad: document.getElementById("inpSoyad"),
    inpEmail: document.getElementById("inpEmail"),
    inpPhone: document.getElementById("inpPhone"),
    inpTitle: document.getElementById("inpTitle"),
    inpExam: document.getElementById("inpExam"),
    
    // Actions
    profileForm: document.getElementById("profileForm"),
    saveMessage: document.getElementById("saveMessage"),
    btnResetPassword: document.getElementById("btnResetPassword"),
    
    // Tabs
    tabs: document.querySelectorAll(".tab-btn"),
    tabContents: document.querySelectorAll(".tab-content")
};

let currentUserUid = null;

// Başlangıç
document.addEventListener("DOMContentLoaded", () => {
    initMobileMenu();
    initTabs();
});

// Auth Durumu
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        await loadUserProfile(user);
    } else {
        window.location.href = "/login.html";
    }
});

// Profil Yükleme
async function loadUserProfile(user) {
    // 1. Temel Bilgiler (Auth'dan)
    dom.inpEmail.value = user.email;
    const defaultName = user.displayName || "";
    
    // Avatar Ayarla
    const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${defaultName || "User"}&background=D4AF37&color=0F172A&bold=true`;
    dom.headerAvatar.src = avatarUrl;
    dom.profileAvatarMain.src = avatarUrl;

    // 2. Detaylı Bilgiler (Firestore'dan)
    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Formu Doldur
            dom.inpAd.value = data.ad || defaultName.split(' ')[0] || "";
            dom.inpSoyad.value = data.soyad || defaultName.split(' ').slice(1).join(' ') || "";
            dom.inpPhone.value = data.phone || "";
            dom.inpTitle.value = data.title || ""; // Ünvan
            dom.inpExam.value = data.targetExam || ""; // Hedef Sınav

            // Sol Kartı Güncelle
            const fullName = `${dom.inpAd.value} ${dom.inpSoyad.value}`;
            dom.profileNameMain.textContent = fullName.trim() || "İsimsiz Kullanıcı";
            dom.profileRoleMain.textContent = data.title || "Üye";

        } else {
            console.log("Kullanıcı profili Firestore'da bulunamadı, oluşturulmalı.");
        }
    } catch (error) {
        console.error("Profil yükleme hatası:", error);
    }
}

// Kaydetme İşlemi
if (dom.profileForm) {
    dom.profileForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        if (!currentUserUid) return;

        const btn = dom.profileForm.querySelector(".btn-save");
        const originalBtnText = btn.textContent;
        btn.textContent = "Kaydediliyor...";
        btn.disabled = true;
        dom.saveMessage.textContent = "";

        try {
            const updateData = {
                ad: dom.inpAd.value.trim(),
                soyad: dom.inpSoyad.value.trim(),
                phone: dom.inpPhone.value.trim(),
                title: dom.inpTitle.value,
                targetExam: dom.inpExam.value,
                updatedAt: new Date()
            };

            const userRef = doc(db, "users", currentUserUid);
            // merge:true ile varsa güncelle, yoksa oluştur (setDoc yerine updateDoc kullandık ama user-profile.js create ediyor zaten)
            await updateDoc(userRef, updateData);

            // UI Güncelle
            dom.profileNameMain.textContent = `${updateData.ad} ${updateData.soyad}`;
            dom.profileRoleMain.textContent = updateData.title || "Üye";

            showMessage("Bilgiler başarıyla güncellendi.", "success");
        } catch (error) {
            console.error("Güncelleme hatası:", error);
            showMessage("Bir hata oluştu. Tekrar deneyin.", "error");
        } finally {
            btn.textContent = originalBtnText;
            btn.disabled = false;
        }
    });
}

// Şifre Sıfırlama
if (dom.btnResetPassword) {
    dom.btnResetPassword.addEventListener("click", async () => {
        if (!dom.inpEmail.value) return;
        
        if (confirm(`${dom.inpEmail.value} adresine şifre sıfırlama bağlantısı gönderilsin mi?`)) {
            try {
                await sendPasswordResetEmail(auth, dom.inpEmail.value);
                alert("E-posta gönderildi! Lütfen gelen kutunuzu kontrol edin.");
            } catch (error) {
                console.error("Şifre sıfırlama hatası:", error);
                alert("İşlem başarısız oldu: " + error.message);
            }
        }
    });
}

// Sekme (Tab) Yönetimi
function initTabs() {
    dom.tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            // Aktif tab butonunu değiştir
            dom.tabs.forEach(t => t.classList.remove("active"));
            btn.classList.add("active");

            // İçeriği değiştir
            const targetId = `tab-${btn.dataset.tab}`;
            dom.tabContents.forEach(c => c.classList.remove("active"));
            document.getElementById(targetId).classList.add("active");
        });
    });
}

// Yardımcı Fonksiyonlar
function showMessage(msg, type) {
    dom.saveMessage.textContent = msg;
    dom.saveMessage.className = `save-msg ${type}`;
    setTimeout(() => { dom.saveMessage.textContent = ""; }, 4000);
}

function initMobileMenu() {
    const toggleMenu = () => {
        dom.sidebar.classList.toggle("active");
        dom.sidebarOverlay.classList.toggle("active");
    };
    if (dom.menuToggle) dom.menuToggle.addEventListener("click", toggleMenu);
    if (dom.closeSidebar) dom.closeSidebar.addEventListener("click", toggleMenu);
    if (dom.sidebarOverlay) dom.sidebarOverlay.addEventListener("click", toggleMenu);
}

// Çıkış
if (dom.logoutBtn) {
    dom.logoutBtn.addEventListener("click", async () => {
        if (confirm("Çıkış yapmak istediğinize emin misiniz?")) {
            await signOut(auth);
            window.location.href = "/login.html";
        }
    });
}