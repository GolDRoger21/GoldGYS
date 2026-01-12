import { auth, db } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, updateDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserProfile, updateUserCache } from "./user-profile.js";

const dom = {
    // Sol Profil Kartı
    profileAvatarMain: document.getElementById("profileAvatarMain"),
    profileNameMain: document.getElementById("profileNameMain"),
    profileRoleMain: document.getElementById("profileRoleMain"),
    statCompleted: document.getElementById("statCompleted"),
    statScore: document.getElementById("statScore"),
    displayTarget: document.getElementById("displayTarget"),
    
    // Form Alanları
    inpAd: document.getElementById("inpAd"),
    inpSoyad: document.getElementById("inpSoyad"),
    inpEmail: document.getElementById("inpEmail"),
    inpPhone: document.getElementById("inpPhone"),
    inpTitle: document.getElementById("inpTitle"),
    inpExam: document.getElementById("inpExam"),
    profileForm: document.getElementById("profileForm"),
    saveMessage: document.getElementById("saveMessage"),
    
    // Güvenlik
    btnResetPassword: document.getElementById("btnResetPassword"),
    
    // Tablar
    tabs: document.querySelectorAll(".tab-link"),
    tabBodies: document.querySelectorAll(".tab-body"),

    // Sağ İstatistik Kartları
    statTopicRatio: document.getElementById("statTopicRatio"),
    statTopicProgress: document.getElementById("statTopicProgress"),
    statTestsCompleted: document.getElementById("statTestsCompleted"),
    statGlobalScore: document.getElementById("statGlobalScore"),
};

/**
 * Profil sayfasını başlatan ana fonksiyon.
 */
export function initProfilePage() {
    const user = auth.currentUser;
    if (user) {
        initTabs();
        loadFullProfile(user);
        
        if (dom.profileForm) {
            dom.profileForm.addEventListener("submit", (e) => {
                e.preventDefault();
                saveProfile(user.uid);
            });
        }
        
        if (dom.btnResetPassword) {
            dom.btnResetPassword.addEventListener("click", () => handlePasswordReset(user.email));
        }
    } else {
        console.error("Kullanıcı oturumu bulunamadı. Bu sayfaya erişim yetkiniz olmayabilir.");
        // initLayout zaten yönlendirmeyi yapacaktır.
    }
}

/**
 * Kullanıcının tüm profil verilerini ve istatistiklerini yükler.
 * @param {object} user - Firebase Auth kullanıcı nesnesi.
 */
async function loadFullProfile(user) {
    if (dom.inpEmail) dom.inpEmail.value = user.email;
    
    try {
        const userData = await getUserProfile(user.uid);
        if (userData) {
            populateForm(userData, user);
            updateInfoCard(userData, user);
        }
        await calculateUserStats(user.uid);
    } catch (error) {
        console.error("Profil verileri yüklenirken bir hata oluştu:", error);
    }
}

/**
 * Form alanlarını kullanıcı verileriyle doldurur.
 * @param {object} userData - Firestore'dan gelen profil verisi.
 * @param {object} user - Firebase Auth kullanıcı nesnesi.
 */
function populateForm(userData, user) {
    let ad = userData.ad;
    let soyad = userData.soyad;

    // Eğer DB'de isim yoksa ama Auth profilinde (örn. Google) varsa, onu kullan
    if (!ad && !soyad && user.displayName) {
        const nameParts = user.displayName.split(' ');
        ad = nameParts[0] || '';
        soyad = nameParts.slice(1).join(' ') || '';
    }

    if (dom.inpAd) dom.inpAd.value = ad || "";
    if (dom.inpSoyad) dom.inpSoyad.value = soyad || "";
    if (dom.inpPhone) dom.inpPhone.value = userData.phone || "";
    if (dom.inpTitle) dom.inpTitle.value = userData.title || "";
    if (dom.inpExam) dom.inpExam.value = userData.targetExam || "";
}

/**
 * Soldaki profil kartını günceller.
 * @param {object} data - Firestore'dan gelen profil verisi.
 * @param {object} user - Firebase Auth kullanıcı nesnesi.
 */
function updateInfoCard(data, user) {
    const fullName = `${data.ad || ''} ${data.soyad || ''}`.trim() || user.displayName || "İsimsiz Kullanıcı";
    const avatarUrl = data.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=D4AF37&color=000&bold=true`;

    if (dom.profileNameMain) dom.profileNameMain.textContent = fullName;
    if (dom.profileAvatarMain) dom.profileAvatarMain.src = avatarUrl;
    if (dom.profileRoleMain) dom.profileRoleMain.textContent = translateRole(data.role);
    if (dom.displayTarget) dom.displayTarget.textContent = data.targetExam || "Belirtilmedi";
}

/**
 * Kullanıcının istatistiklerini hesaplar ve UI'da gösterir.
 * @param {string} uid - Kullanıcı ID'si.
 */
async function calculateUserStats(uid) {
    try {
        const progressRef = collection(db, `users/${uid}/progress`);
        const progressSnapshot = await getDocs(progressRef);
        
        let totalTestsFinished = 0;
        let totalScoreSum = 0;
        let scoreCount = 0;
        let workedTopicsCount = progressSnapshot.size;

        progressSnapshot.forEach((doc) => {
            const data = doc.data();
            totalTestsFinished += Number(data.completedTests || 0);
            if (data.scoreAvg !== undefined && data.scoreAvg !== null) {
                totalScoreSum += Number(data.scoreAvg);
                scoreCount++;
            }
        });

        const totalTopicsCount = await getTotalTopicsCount();
        const globalAvg = scoreCount > 0 ? (totalScoreSum / scoreCount).toFixed(1) : "0";
        const progressPercent = totalTopicsCount > 0 ? Math.min(100, Math.round((workedTopicsCount / totalTopicsCount) * 100)) : 0;

        // Sol Kart
        if (dom.statCompleted) dom.statCompleted.textContent = totalTestsFinished;
        if (dom.statScore) dom.statScore.textContent = globalAvg;
        // Sağ Kartlar
        if (dom.statTestsCompleted) dom.statTestsCompleted.textContent = totalTestsFinished;
        if (dom.statGlobalScore) dom.statGlobalScore.textContent = `%${globalAvg}`;
        if (dom.statTopicRatio) dom.statTopicRatio.textContent = `${workedTopicsCount} / ${totalTopicsCount} Konu`;
        if (dom.statTopicProgress) dom.statTopicProgress.style.width = `${progressPercent}%`;

    } catch (error) {
        console.warn("İstatistik hesaplama hatası:", error);
    }
}

/**
 * Toplam konu sayısını (cache'li) getirir.
 * @returns {Promise<number>}
 */
async function getTotalTopicsCount() {
    const cachedCount = sessionStorage.getItem('total_topics_count');
    if (cachedCount) return Number(cachedCount);

    try {
        const topicsSnap = await getDocs(collection(db, "topics"));
        const count = topicsSnap.size;
        sessionStorage.setItem('total_topics_count', count);
        return count;
    } catch (error) {
        console.error("Toplam konu sayısı alınamadı:", error);
        return 0; // Hata durumunda 0 dön
    }
}

/**
 * Profil bilgilerini Firestore'a kaydeder.
 * @param {string} uid - Kullanıcı ID'si.
 */
async function saveProfile(uid) {
    const btn = dom.profileForm.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "Kaydediliyor...";
    dom.saveMessage.textContent = "";

    try {
        const updatePayload = {
            ad: dom.inpAd.value.trim(),
            soyad: dom.inpSoyad.value.trim(),
            phone: dom.inpPhone.value.trim(),
            title: dom.inpTitle.value.trim(),
            targetExam: dom.inpExam.value,
            updatedAt: new Date()
        };

        await updateDoc(doc(db, "users", uid), updatePayload);
        await updateUserCache(uid, updatePayload); // Cache'i de güncelle

        // UI'ı anında güncelle
        const user = auth.currentUser;
        const updatedData = await getUserProfile(user.uid, { force: true }); // Cache'i atlayıp yeniden çek
        updateInfoCard(updatedData, user);

        dom.saveMessage.textContent = "✓ Başarıyla kaydedildi";
        dom.saveMessage.style.color = "var(--color-success)";

    } catch (error) {
        console.error("Profil kaydedilemedi:", error);
        dom.saveMessage.textContent = "Hata: " + error.message;
        dom.saveMessage.style.color = "var(--color-danger)";
    } finally {
        btn.disabled = false;
        btn.textContent = "Değişiklikleri Kaydet";
    }
}

function handlePasswordReset(email) {
    if (!email) return;
    if (confirm("Şifre sıfırlama bağlantısı e-posta adresinize gönderilsin mi?")) {
        sendPasswordResetEmail(auth, email)
            .then(() => alert("Sıfırlama e-postası başarıyla gönderildi."))
            .catch(e => alert("Hata: " + e.message));
    }
}

function initTabs() {
    dom.tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            dom.tabs.forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            
            const targetId = `tab-${btn.dataset.tab}`;
            dom.tabBodies.forEach(body => {
                body.classList.toggle("active", body.id === targetId);
            });
        });
    });
}

function translateRole(role) {
    switch (role) {
        case 'admin': return 'Yönetici';
        case 'editor': return 'Editör';
        default: return 'Öğrenci';
    }
}
