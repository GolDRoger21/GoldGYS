import { auth, db } from "./firebase-config.js";
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserProfile, updateUserCache } from "./user-profile.js";

// DOM Elemanlarını dinamik olarak alacağız çünkü sayfa yüklendiğinde hepsi hazır olmayabilir
const getDom = () => ({
    profileAvatarMain: document.getElementById("profileAvatarMain"),
    profileAvatarPlaceholder: document.getElementById("profileAvatarPlaceholder"),
    profileNameMain: document.getElementById("profileNameMain"),
    profileRoleMain: document.getElementById("profileRoleMain"),
    statCompleted: document.getElementById("statCompleted"),
    statScore: document.getElementById("statScore"),
    displayTarget: document.getElementById("displayTarget"),
    
    inpAd: document.getElementById("inpAd"),
    inpSoyad: document.getElementById("inpSoyad"),
    inpEmail: document.getElementById("inpEmail"),
    inpPhone: document.getElementById("inpPhone"),
    inpTitle: document.getElementById("inpTitle"),
    inpExam: document.getElementById("inpExam"),
    profileForm: document.getElementById("profileForm"),
    saveMessage: document.getElementById("saveMessage"),
    btnResetPassword: document.getElementById("btnResetPassword"),
    
    // İstatistikler
    statTopicRatio: document.getElementById("statTopicRatio"),
    statTopicProgress: document.getElementById("statTopicProgress"),
    statTestsCompleted: document.getElementById("statTestsCompleted"),
});

export function initProfilePage() {
    const user = auth.currentUser;
    if (user) {
        initTabs();
        loadFullProfile(user);
        
        const dom = getDom();
        if (dom.profileForm) {
            // Event listener duplication önlemek için 'submit' öncesi klonlama veya kontrol yapılabilir
            // Basitlik adına doğrudan ekliyoruz (sayfa yenilendiğinde bellek temizlenir)
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

    // Avatar Logic
    const photoURL = data.photoURL || user.photoURL;
    if (photoURL && dom.profileAvatarMain) {
        dom.profileAvatarMain.src = photoURL;
        dom.profileAvatarMain.style.display = 'block';
        if(dom.profileAvatarPlaceholder) dom.profileAvatarPlaceholder.style.display = 'none';
    } else {
        if (dom.profileAvatarMain) dom.profileAvatarMain.style.display = 'none';
        if (dom.profileAvatarPlaceholder) {
            dom.profileAvatarPlaceholder.textContent = fullName.charAt(0).toUpperCase();
            dom.profileAvatarPlaceholder.style.display = 'flex';
        }
    }
}

async function calculateUserStats(uid) {
    const dom = getDom();
    try {
        const progressRef = collection(db, `users/${uid}/progress`);
        const snap = await getDocs(progressRef);
        
        let completed = 0;
        let scoreSum = 0;
        let count = 0;

        snap.forEach(doc => {
            const d = doc.data();
            completed += Number(d.completedTests || 0);
            if (d.scoreAvg) {
                scoreSum += Number(d.scoreAvg);
                count++;
            }
        });

        const avg = count > 0 ? (scoreSum / count).toFixed(0) : "0";
        
        if (dom.statCompleted) dom.statCompleted.textContent = completed;
        if (dom.statScore) dom.statScore.textContent = avg;
        if (dom.statTestsCompleted) dom.statTestsCompleted.textContent = completed;

        // Demo amaçlı topic sayısı (gerçek DB'den çekilebilir)
        const totalTopics = 20; 
        const worked = snap.size;
        const ratio = Math.min(100, Math.round((worked / totalTopics) * 100));

        if (dom.statTopicRatio) dom.statTopicRatio.textContent = `${worked} / ${totalTopics} Konu`;
        if (dom.statTopicProgress) dom.statTopicProgress.style.width = `${ratio}%`;

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
        const newData = await getUserProfile(user.uid, { force: true });
        updateInfoCard(newData, user);

        dom.saveMessage.textContent = "✓ Kaydedildi";
        dom.saveMessage.style.color = "var(--color-success)";
    } catch (e) {
        dom.saveMessage.textContent = "Hata: " + e.message;
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
    if(role === 'admin') return 'Yönetici';
    if(role === 'editor') return 'Editör';
    return 'Öğrenci';
}
