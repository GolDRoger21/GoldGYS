import { auth, db } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, updateDoc, collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserProfile, updateUserCache } from "./user-profile.js";
import { CacheManager } from "./cache-manager.js";
import { showConfirm, showToast } from "./notifications.js";

// DOM Elemanlarını dinamik olarak alacağız
const getDom = () => ({
    // Profil Sayfası Özel Elementleri
    profileAvatarMain: document.getElementById("profileAvatarMain"),
    profileAvatarPlaceholder: document.getElementById("profileAvatarPlaceholder"),
    profileNameMain: document.getElementById("profileNameMain"),
    profileRoleMain: document.getElementById("profileRoleMain"),
    statCompleted: document.getElementById("statCompleted"),
    statScore: document.getElementById("statScore"),
    displayTarget: document.getElementById("displayTarget"),

    // Form Elementleri
    inpAd: document.getElementById("inpAd"),
    inpSoyad: document.getElementById("inpSoyad"),
    inpEmail: document.getElementById("inpEmail"),
    inpPhone: document.getElementById("inpPhone"),
    inpTitle: document.getElementById("inpTitle"),
    inpExam: document.getElementById("inpExam"),
    profileForm: document.getElementById("profileForm"),
    saveMessage: document.getElementById("saveMessage"),
    btnResetPassword: document.getElementById("btnResetPassword"),

});

export function initProfilePage() {
    const user = auth.currentUser;
    if (user) {
        initTabs();
        loadFullProfile(user);

        const dom = getDom();
        if (dom.profileForm) {
            dom.profileForm.onsubmit = (e) => {
                e.preventDefault();
                saveProfile(user.uid);
            };
        }

        if (dom.btnResetPassword) {
            dom.btnResetPassword.onclick = () => handlePasswordReset(user.email);
        }
    }
}

async function loadFullProfile(user) {
    const dom = getDom();
    if (dom.inpEmail) dom.inpEmail.value = user.email;

    try {
        const userData = await getUserProfile(user.uid);
        if (userData) {
            populateForm(userData, user);
            updateInfoCard(userData, user);
        }
        await calculateUserStats(user.uid);
    } catch (error) {
        console.error("Profil yükleme hatası:", error);
    }
}

function populateForm(userData, user) {
    const dom = getDom();
    let ad = userData.ad;
    let soyad = userData.soyad;

    // Eğer veritabanında ad/soyad yoksa Google profilinden almaya çalış
    if (!ad && !soyad && user.displayName) {
        const parts = user.displayName.split(' ');
        ad = parts[0];
        soyad = parts.slice(1).join(' ');
    }

    if (dom.inpAd) dom.inpAd.value = ad || "";
    if (dom.inpSoyad) dom.inpSoyad.value = soyad || "";
    if (dom.inpPhone) dom.inpPhone.value = userData.phone || "";
    if (dom.inpTitle) dom.inpTitle.value = userData.title || "";
    if (dom.inpExam) dom.inpExam.value = userData.targetExam || "";
}

function updateInfoCard(data, user) {
    const dom = getDom();
    const fullName = `${data.ad || ''} ${data.soyad || ''}`.trim() || user.displayName || "İsimsiz";

    if (dom.profileNameMain) dom.profileNameMain.textContent = fullName;
    if (dom.profileRoleMain) dom.profileRoleMain.textContent = translateRole(data.role);
    if (dom.displayTarget) dom.displayTarget.textContent = data.targetExam || "Belirtilmedi";

    // Profil Sayfası Avatarı (Büyük)
    const photoURL = data.photoURL || user.photoURL;
    if (photoURL && dom.profileAvatarMain) {
        dom.profileAvatarMain.src = photoURL;
        dom.profileAvatarMain.style.display = 'block';
        if (dom.profileAvatarPlaceholder) dom.profileAvatarPlaceholder.style.display = 'none';
    } else {
        if (dom.profileAvatarMain) dom.profileAvatarMain.style.display = 'none';
        if (dom.profileAvatarPlaceholder) {
            dom.profileAvatarPlaceholder.textContent = fullName.charAt(0).toUpperCase();
            dom.profileAvatarPlaceholder.style.display = 'flex';
        }
    }
}

// YENİ FONKSİYON: Profil güncellenince Header ve Sidebar'ı da güncelle
function updateGlobalHeader(data, user) {
    const fullName = `${data.ad || ''} ${data.soyad || ''}`.trim() || user.displayName || "Kullanıcı";
    const initial = fullName.charAt(0).toUpperCase();
    const photoURL = data.photoURL || user.photoURL;

    // header.html ve ui-loader.js ile uyumlu ID'ler
    const globalIds = {
        names: ['userNameLabel', 'dropdownUserName', 'headerUserName'],
        circles: ['userAvatarCircle', 'dropdownAvatarCircle'],
        images: ['userAvatarImage', 'dropdownAvatarImage'],
        initials: ['userAvatarInitial', 'dropdownAvatarInitial']
    };

    // İsimleri güncelle
    globalIds.names.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = fullName;
    });

    // Resimleri/Baş harfleri güncelle
    globalIds.circles.forEach((circleId, index) => {
        const circle = document.getElementById(circleId);
        const img = document.getElementById(globalIds.images[index]);
        const initEl = document.getElementById(globalIds.initials[index]);

        if (!circle || !img) return;

        if (photoURL) {
            circle.classList.add('has-photo');
            img.src = photoURL;
            img.style.display = 'block';
            if (initEl) initEl.style.display = 'none';
        } else {
            circle.classList.remove('has-photo');
            img.style.display = 'none';
            if (initEl) {
                initEl.style.display = 'flex';
                initEl.textContent = initial;
            }
        }
    });
}

async function calculateUserStats(uid) {
    const dom = getDom();
    if (!dom.statCompleted && !dom.statScore) return;

    try {
        const resultsCacheKey = `exam_results_col_${uid}`;
        let rawResults = [];
        const cachedResults = await CacheManager.getData(resultsCacheKey, 5 * 60 * 1000); // 5 dakika

        if (cachedResults?.cached && cachedResults.data) {
            rawResults = cachedResults.data;
        } else {
            const resultsQuery = query(collection(db, `users/${uid}/exam_results`), orderBy('completedAt', 'desc'), limit(100));
            const resultSnap = await getDocs(resultsQuery);
            rawResults = resultSnap.docs.map(d => d.data());
            await CacheManager.saveData(resultsCacheKey, rawResults, 5 * 60 * 1000);
        }

        let completed = rawResults.length;
        let scoreSum = rawResults.reduce((sum, exam) => sum + Number(exam.score || 0), 0);
        const avg = completed > 0 ? (scoreSum / completed).toFixed(0) : "0";

        if (dom.statCompleted) dom.statCompleted.textContent = completed;
        if (dom.statScore) dom.statScore.textContent = `%${avg}`;
    } catch (e) {
        console.warn("İstatistik hatası:", e);
    }
}

async function saveProfile(uid) {
    const dom = getDom();
    const btn = dom.profileForm.querySelector("button[type='submit']");
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = "Kaydediliyor...";
    dom.saveMessage.textContent = "";

    try {
        const payload = {
            ad: dom.inpAd.value.trim(),
            soyad: dom.inpSoyad.value.trim(),
            phone: dom.inpPhone.value.trim(),
            title: dom.inpTitle.value.trim(),
            targetExam: dom.inpExam.value,
            updatedAt: new Date()
        };

        await updateDoc(doc(db, "users", uid), payload);
        await updateUserCache(uid, payload);

        // UI güncelle
        const user = auth.currentUser;
        const currentProfile = await getUserProfile(user.uid);
        const newData = { ...(currentProfile || {}), ...payload };

        // 1. Sayfa içi kartı güncelle
        updateInfoCard(newData, user);
        // 2. Header ve Menüyü anlık güncelle (YENİ)
        updateGlobalHeader(newData, user);

        dom.saveMessage.textContent = "✓ Kaydedildi";
        dom.saveMessage.style.color = "var(--color-success)";

        // 3 saniye sonra mesajı sil
        setTimeout(() => { if (dom.saveMessage) dom.saveMessage.textContent = ""; }, 3000);

    } catch (e) {
        dom.saveMessage.textContent = "Hata: " + e.message;
        dom.saveMessage.style.color = "var(--color-danger)";
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function handlePasswordReset(email) {
    if (!email) return;
    const shouldSend = await showConfirm("Şifre sıfırlama bağlantısını e-posta adresinize göndermek istiyor musunuz?", {
        title: "Şifre Sıfırlama",
        confirmText: "Gönder",
        cancelText: "Vazgeç"
    });
    if (!shouldSend) return;

    sendPasswordResetEmail(auth, email)
        .then(() => showToast("Şifre sıfırlama bağlantısı gönderildi.", "success"))
        .catch(e => showToast(`Gönderim sırasında hata oluştu: ${e.message}`, "error"));
}

function initTabs() {
    const tabs = document.querySelectorAll(".tab-link");
    const bodies = document.querySelectorAll(".tab-body");

    tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            btn.classList.add("active");

            const targetId = `tab-${btn.dataset.tab}`;
            bodies.forEach(b => {
                b.classList.toggle("active", b.id === targetId);
            });
        });
    });
}

function translateRole(role) {
    if (role === 'admin') return 'Yönetici';
    if (role === 'editor') return 'Editör';
    return 'Öğrenci';
}
