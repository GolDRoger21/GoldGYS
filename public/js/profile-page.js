
import { auth, db } from "./firebase-config.js";
import { sendPasswordResetEmail, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, updateDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserProfile, updateUserCache } from "./user-profile.js";

const dom = {
    avatarImg: document.getElementById("profileAvatarMain"),
    nameText: document.getElementById("profileNameMain"),
    roleText: document.getElementById("profileRoleMain"),
    statCompleted: document.getElementById("statCompleted"),
    statScore: document.getElementById("statScore"),
    displayTarget: document.getElementById("displayTarget"),
    
    inpAd: document.getElementById("inpAd"),
    inpSoyad: document.getElementById("inpSoyad"),
    inpEmail: document.getElementById("inpEmail"),
    inpPhone: document.getElementById("inpPhone"),
    inpTitle: document.getElementById("inpTitle"),
    inpExam: document.getElementById("inpExam"),
    
    form: document.getElementById("profileForm"),
    saveMessage: document.getElementById("saveMessage"),
    btnReset: document.getElementById("btnResetPassword"),
    
    tabs: document.querySelectorAll(".tab-link"),
    tabBodies: document.querySelectorAll(".tab-body"),

    // Yeni DOM elementleri
    statTopicRatio: document.getElementById("statTopicRatio"),
    statTopicProgress: document.getElementById("statTopicProgress"),
    statTestsCompleted: document.getElementById("statTestsCompleted"),
    statGlobalScore: document.getElementById("statGlobalScore"),
};

export function initProfilePage() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            initTabs();
            await loadFullProfile(user);
            if(dom.form) {
                dom.form.addEventListener("submit", (e) => {
                    e.preventDefault();
                    saveProfile(user.uid);
                });
            }
            if(dom.btnReset) {
                dom.btnReset.addEventListener("click", () => handlePasswordReset(user.email));
            }
        } else {
            window.location.href = "/login.html";
        }
    });
}

async function loadFullProfile(user) {
    if(dom.inpEmail) dom.inpEmail.value = user.email;
    
    try {
        const userData = await getUserProfile(user.uid);
        if (userData) {
            if(dom.inpAd) dom.inpAd.value = userData.ad || "";
            if(dom.inpSoyad) dom.inpSoyad.value = userData.soyad || "";
            if(dom.inpPhone) dom.inpPhone.value = userData.phone || "";
            if(dom.inpTitle) dom.inpTitle.value = userData.title || "";
            if(dom.inpExam) dom.inpExam.value = userData.targetExam || "";
            
            updateInfoCard(userData, user);
        }

        await calculateUserStats(user.uid);

    } catch (error) {
        console.error("Profil verisi çekilemedi:", error);
    }
}

async function calculateUserStats(uid) {
    try {
        // 1. Kullanıcının İlerlemesini Çek
        const progressRef = collection(db, `users/${uid}/progress`);
        const progressSnapshot = await getDocs(progressRef);
        
        let totalTestsFinished = 0;
        let totalScoreSum = 0;
        let scoreCount = 0;
        let workedTopicsCount = progressSnapshot.size; // Kaç farklı konuda işlem yapılmış

        progressSnapshot.forEach((doc) => {
            const data = doc.data();
            
            // Tamamlanan test sayısı
            if (data.completedTests) {
                totalTestsFinished += Number(data.completedTests);
            }

            // Ortalama Puan Hesabı
            if (data.scoreAvg !== undefined && data.scoreAvg !== null) {
                totalScoreSum += Number(data.scoreAvg);
                scoreCount++;
            }
        });

        // 2. Toplam Konu Sayısını Çek (İlerleme Çubuğu İçin)
        let totalTopicsCount = 0;
        const cachedTopicsCount = sessionStorage.getItem('total_topics_count');
        
        if (cachedTopicsCount) {
            totalTopicsCount = Number(cachedTopicsCount);
        } else {
            const topicsQuery = query(collection(db, "topics")); 
            const topicsSnap = await getDocs(topicsQuery);
            totalTopicsCount = topicsSnap.size;
            sessionStorage.setItem('total_topics_count', totalTopicsCount);
        }

        // 3. Hesaplamaları UI'a Bas
        const globalAvg = scoreCount > 0 ? (totalScoreSum / scoreCount).toFixed(1) : "0";
        
        // Yan Panel (Sol)
        if(dom.statCompleted) dom.statCompleted.textContent = totalTestsFinished;
        if(dom.statScore) dom.statScore.textContent = globalAvg;

        // Ana Panel (Sağ - Yeni İstatistikler)
        if(dom.statTestsCompleted) dom.statTestsCompleted.textContent = totalTestsFinished;
        if(dom.statGlobalScore) dom.statGlobalScore.textContent = `%${globalAvg}`;
        
        const progressPercent = totalTopicsCount > 0 
            ? Math.min(100, Math.round((workedTopicsCount / totalTopicsCount) * 100)) 
            : 0;
            
        if(dom.statTopicRatio) dom.statTopicRatio.textContent = `${workedTopicsCount} / ${totalTopicsCount} Konu`;
        if(dom.statTopicProgress) dom.statTopicProgress.style.width = `${progressPercent}%`;

    } catch (error) {
        console.warn("İstatistik hesaplama hatası:", error);
    }
}

function updateInfoCard(data, user) {
    const fullName = `${data.ad || ''} ${data.soyad || ''}`.trim();
    if(dom.nameText) dom.nameText.textContent = fullName || user.displayName || "İsimsiz Kullanıcı";

    let roleDisplay = "Öğrenci";
    if (data.role) {
        switch (data.role) {
            case 'admin': roleDisplay = "Yönetici"; break;
            case 'editor': roleDisplay = "Editör"; break;
            case 'user': roleDisplay = "Öğrenci"; break;
            default: roleDisplay = "Üye";
        }
    }
    if(dom.roleText) dom.roleText.textContent = roleDisplay;
    
    if(dom.displayTarget) dom.displayTarget.textContent = data.targetExam || "Belirtilmedi";
    
    const avatarUrl = data.photoURL || user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName || user.displayName)}&background=D4AF37&color=000&bold=true`;
    if(dom.avatarImg) dom.avatarImg.src = avatarUrl;
}

async function saveProfile(uid) {
    const btn = dom.form.querySelector("button[type='submit']");
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Kaydediliyor...";
    if(dom.saveMessage) dom.saveMessage.textContent = "";

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
        
        updateUserCache(uid, {
            ...updatePayload,
            updatedAt: new Date().toISOString()
        });
        
        const user = auth.currentUser;
        const updatedDataFromCache = await getUserProfile(user.uid);
        updateInfoCard(updatedDataFromCache, user);

        if(dom.saveMessage) {
            dom.saveMessage.textContent = "✓ Başarıyla kaydedildi";
            dom.saveMessage.style.color = "var(--color-success)";
        }

    } catch (error) {
        console.error(error);
        if(dom.saveMessage) {
            dom.saveMessage.textContent = "Hata: " + error.message;
            dom.saveMessage.style.color = "var(--color-danger)";
        }
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function handlePasswordReset(email) {
    if(!email) return;
    if(confirm("Şifre sıfırlama bağlantısı gönderilsin mi?")) {
        sendPasswordResetEmail(auth, email)
            .then(() => alert("E-posta gönderildi."))
            .catch(e => alert("Hata: " + e.message));
    }
}

function initTabs() {
    if(!dom.tabs) return;
    dom.tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            dom.tabs.forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            
            const target = btn.dataset.tab;
            dom.tabBodies.forEach(body => {
                body.classList.remove("active");
                if(body.id === `tab-${target}`) body.classList.add("active");
            });
        });
    });
}
