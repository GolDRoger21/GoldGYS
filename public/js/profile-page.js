import { auth, db } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, updateDoc, collection, getDocs, query } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserProfile } from "./user-profile.js";

const dom = {
    // Yeni HTML yapısına uygun ID'ler
    avatarImg: document.getElementById("profileAvatarMain"),
    nameText: document.getElementById("profileNameMain"),
    roleText: document.getElementById("profileRoleMain"),
    statCompleted: document.getElementById("statCompleted"),
    statScore: document.getElementById("statScore"),
    displayTarget: document.getElementById("displayTarget"),
    
    // Form elemanları
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
    tabBodies: document.querySelectorAll(".tab-body")
};

export async function initProfilePage() {
    const user = auth.currentUser;
    if (!user) {
        // Oturum yoksa dashboard login check zaten yönlendirir ama güvenlik önlemi
        window.location.href = "/login.html";
        return;
    }

    // Tab Eventlerini Başlat
    initTabs();

    // Verileri Yükle
    await loadFullProfile(user);
    
    // Form Dinleyicisi
    if(dom.form) {
        dom.form.addEventListener("submit", (e) => {
            e.preventDefault();
            saveProfile(user.uid);
        });
    }

    // Şifre Sıfırlama Dinleyicisi
    if(dom.btnReset) {
        dom.btnReset.addEventListener("click", () => handlePasswordReset(user.email));
    }
}

async function loadFullProfile(user) {
    // 1. Auth verileri
    dom.inpEmail.value = user.email;
    const defaultAvatar = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.email)}&background=D4AF37&color=000&bold=true`;
    if(dom.avatarImg) dom.avatarImg.src = defaultAvatar;

    // 2. Firestore Kullanıcı Dokümanı
    try {
        const userData = await getUserProfile(user.uid);
        if (userData) {
            dom.inpAd.value = userData.ad || "";
            dom.inpSoyad.value = userData.soyad || "";
            dom.inpPhone.value = userData.phone || "";
            dom.inpTitle.value = userData.title || "";
            dom.inpExam.value = userData.targetExam || "";
            
            // Kart Bilgileri Güncelle
            updateInfoCard(userData);
        }

        // 3. İstatistikleri Hesapla (users/{uid}/progress koleksiyonundan)
        await calculateUserStats(user.uid);

    } catch (error) {
        console.error("Profil verisi çekilemedi:", error);
    }
}

async function calculateUserStats(uid) {
    try {
        // Data model: users/{uid}/progress -> { completedTests: number, scoreAvg: number }
        const q = query(collection(db, `users/${uid}/progress`));
        const querySnapshot = await getDocs(q);
        
        let totalTests = 0;
        let totalScoreSum = 0;
        let scoreCount = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.completedTests) totalTests += 1; // veya data.completedTests sayısını topla
            if (data.scoreAvg) {
                totalScoreSum += data.scoreAvg;
                scoreCount++;
            }
        });

        const avg = scoreCount > 0 ? (totalScoreSum / scoreCount).toFixed(1) : "--";
        
        if(dom.statCompleted) dom.statCompleted.textContent = totalTests;
        if(dom.statScore) dom.statScore.textContent = avg;

    } catch (error) {
        console.warn("İstatistikler hesaplanamadı:", error);
    }
}

function updateInfoCard(data) {
    const fullName = `${data.ad || ''} ${data.soyad || ''}`.trim();
    if(dom.nameText) dom.nameText.textContent = fullName || "İsimsiz Kullanıcı";
    if(dom.roleText) dom.roleText.textContent = data.title || "Üye";
    if(dom.displayTarget) dom.displayTarget.textContent = data.targetExam || "Belirtilmedi";
}

async function saveProfile(uid) {
    const btn = dom.form.querySelector("button[type='submit']");
    const originalText = btn.textContent;
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
        
        // UI Güncelle
        updateInfoCard(updatePayload);
        dom.saveMessage.textContent = "✓ Başarıyla kaydedildi";
        dom.saveMessage.style.color = "var(--color-success)";

    } catch (error) {
        console.error(error);
        dom.saveMessage.textContent = "Hata: " + error.message;
        dom.saveMessage.style.color = "var(--color-danger)";
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
    dom.tabs.forEach(btn => {
        btn.addEventListener("click", () => {
            // Aktif tab butonunu değiştir
            dom.tabs.forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            
            // İçeriği değiştir
            const target = btn.dataset.tab;
            dom.tabBodies.forEach(body => {
                body.classList.remove("active");
                if(body.id === `tab-${target}`) body.classList.add("active");
            });
        });
    });
}