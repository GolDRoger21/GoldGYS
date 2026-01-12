// public/js/profile-page.js

import { auth, db } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// DOM Elementleri (Sadece bu sayfaya özel)
const dom = {
    profileAvatarMain: document.getElementById("profileAvatarMain"),
    profileNameMain: document.getElementById("profileNameMain"),
    profileRoleMain: document.getElementById("profileRoleMain"),
    inpAd: document.getElementById("inpAd"),
    inpSoyad: document.getElementById("inpSoyad"),
    inpEmail: document.getElementById("inpEmail"),
    inpPhone: document.getElementById("inpPhone"),
    inpTitle: document.getElementById("inpTitle"),
    inpExam: document.getElementById("inpExam"),
    profileForm: document.getElementById("profileForm"),
    saveMessage: document.getElementById("saveMessage"),
    btnResetPassword: document.getElementById("btnResetPassword"),
    tabs: document.querySelectorAll(".tab-btn"),
    tabContents: document.querySelectorAll(".tab-content")
};

// Bu fonksiyon profil.html tarafından çağrılacak
export function initProfilePage() {
    const user = auth.currentUser;
    if (!user) {
        console.error("Profile page initialized without a user.");
        return;
    }

    loadUserProfile(user);
    initTabs();
    setupEventListeners(user.uid);
}

// Firestore'dan detaylı kullanıcı verisini yükler ve formu doldurur
async function loadUserProfile(user) {
    // 1. Temel Bilgileri Auth'dan al
    dom.inpEmail.value = user.email;
    const defaultName = user.displayName || "";

    // Ana avatarı ayarla (Header avatarı ui-loader tarafından ayarlandı)
    const avatarUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(defaultName || user.email.split('@')[0])}&background=D4AF37&color=0F172A&bold=true`;
    if (dom.profileAvatarMain) dom.profileAvatarMain.src = avatarUrl;

    // 2. Firestore'dan detaylı bilgileri çek
    try {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            dom.inpAd.value = data.ad || defaultName.split(' ')[0] || "";
            dom.inpSoyad.value = data.soyad || defaultName.split(' ').slice(1).join(' ') || "";
            dom.inpPhone.value = data.phone || "";
            dom.inpTitle.value = data.title || "";
            dom.inpExam.value = data.targetExam || "";

            const fullName = `${dom.inpAd.value} ${dom.inpSoyad.value}`.trim();
            dom.profileNameMain.textContent = fullName || "İsimsiz Kullanıcı";
            dom.profileRoleMain.textContent = data.title || "Üye";
        }
    } catch (error) {
        console.error("Profil yükleme hatası:", error);
    }
}

// Tüm olay dinleyicilerini (form submit, şifre sıfırlama vb.) kurar
function setupEventListeners(uid) {
    if (dom.profileForm) {
        dom.profileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            handleProfileSave(uid);
        });
    }

    if (dom.btnResetPassword) {
        dom.btnResetPassword.addEventListener("click", handlePasswordReset);
    }
}

// Profil bilgilerini kaydetme mantığı
async function handleProfileSave(uid) {
    const btn = dom.profileForm.querySelector("button[type='submit']"); // Daha spesifik seçici
    if (!btn) return;

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

        await updateDoc(doc(db, "users", uid), updateData);
        
        // Sayfadaki ana kartı da anında güncelle
        dom.profileNameMain.textContent = `${updateData.ad} ${updateData.soyad}`.trim();
        dom.profileRoleMain.textContent = updateData.title || "Üye";

        showMessage("Bilgiler başarıyla güncellendi.", "success");
    } catch (error) {
        console.error("Güncelleme hatası:", error);
        showMessage("Bir hata oluştu. Tekrar deneyin.", "error");
    } finally {
        btn.textContent = originalBtnText;
        btn.disabled = false;
    }
}

// Şifre sıfırlama mantığı
async function handlePasswordReset() {
    const email = auth.currentUser?.email;
    if (!email) return;

    if (confirm(`${email} adresine şifre sıfırlama bağlantısı gönderilsin mi?`)) {
        try {
            await sendPasswordResetEmail(auth, email);
            alert("E-posta gönderildi! Lütfen gelen kutunuzu kontrol edin.");
        } catch (error) {
            console.error("Şifre sıfırlama hatası:", error);
            alert("İşlem başarısız oldu: " + error.message);
        }
    }
}

// Sekme (Tab) Yönetimi
function initTabs() {
    dom.tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            dom.tabs.forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            const targetId = `tab-${btn.dataset.tab}`;
            dom.tabContents.forEach(c => c.classList.remove("active"));
            document.getElementById(targetId)?.classList.add("active");
        });
    });
}

// Kullanıcıya geri bildirim mesajı gösterir
function showMessage(msg, type) {
    dom.saveMessage.textContent = msg;
    dom.saveMessage.className = `save-msg ${type}`;
    setTimeout(() => { dom.saveMessage.textContent = ""; }, 4000);
}
