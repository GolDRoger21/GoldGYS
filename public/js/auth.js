import { auth } from "./firebase-config.js";
import { ensureUserDocument, clearUserCache } from "./user-profile.js";
import {
    GoogleAuthProvider,
    browserLocalPersistence,
    getRedirectResult,
    setPersistence,
    signInWithPopup,
    signInWithRedirect,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const googleLoginButton = document.getElementById("googleLogin");
const loader = document.getElementById("loader");
const statusBox = document.getElementById("statusBox");
const agreementCheckbox = document.getElementById("agreementCheck");

const provider = new GoogleAuthProvider();
let isLoading = false;

const hasAcceptedAgreement = () => !agreementCheckbox || agreementCheckbox.checked;

const updateLoginButtonState = () => {
    if (!googleLoginButton) return;
    const isAgreementMissing = !hasAcceptedAgreement();
    googleLoginButton.disabled = isLoading || isAgreementMissing;
    googleLoginButton.style.opacity = googleLoginButton.disabled ? "0.6" : "1";
    googleLoginButton.style.pointerEvents = googleLoginButton.disabled ? "none" : "auto";
};

// Yükleme animasyonunu yönetir
const toggleLoading = (loading) => {
    if (googleLoginButton) {
        isLoading = loading;
        updateLoginButtonState();
        googleLoginButton.innerHTML = loading
            ? `<span>İşlem yapılıyor...</span>`
            : `<svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Google ile Giriş Yap`;
    }
    if (loader) loader.style.display = loading ? "block" : "none";
};

const showStatus = (type, message) => {
    if (!statusBox) return;
    statusBox.innerHTML = message;
    statusBox.className = `status-box ${type === "error" ? "status-error" : "status-pending"}`;
    statusBox.style.display = "block";
};

// Ana giriş başarılı fonksiyonu
const handleLoginSuccess = async (user) => {
    if (!user) return;

    showStatus("pending", "Profiliniz doğrulanıyor, lütfen bekleyin...");

    // 0. E-posta Doğrulaması Kontrolü (YENİ GÜVENLİK ADIMI)
    if (!user.emailVerified) {
        showStatus("error", "Güvenlik gereği sadece doğrulanmış e-posta adresleri kabul edilmektedir. Lütfen Google hesabınızın e-posta doğrulamasını tamamlayın.");
        await signOut(auth);
        return;
    }

    try {
        // 1. Veritabanı kontrolü yap (Yoksa oluşturur)
        const userProfile = await ensureUserDocument(user);

        // 2. Statü Kontrolü
        if (userProfile.status === "pending") {
            // YENİ ÜYE veya ONAY BEKLEYEN ÜYE
            showStatus("pending", "Üyelik başvurunuz alındı. Onay sayfasına yönlendiriliyorsunuz...");
            setTimeout(() => {
                window.location.href = "/pending-approval";
            }, 1000);
            return;
        }

        if (userProfile.status === "rejected") {
            showStatus("error", "❌ Üyelik başvurunuz reddedilmiştir. <br><a href='/yardim'>Destek için tıklayın.</a>");
            await signOut(auth); // Oturumu kapat
            return;
        }

        if (userProfile.status === "suspended") {
            showStatus("error", "⚠️ Hesabınız askıya alınmıştır.");
            await signOut(auth);
            return;
        }

        if (userProfile.status === "active") {
            showStatus("pending", "Giriş başarılı! Yönlendiriliyorsunuz...");
            window.location.href = "/dashboard";
        }

    } catch (error) {
        console.error("Profil Yükleme Hatası:", error);

        if (error.code === "permission-denied") {
            showStatus("error", "Veritabanı erişim izni reddedildi. Lütfen sistem yöneticisi ile görüşün.");
        } else {
            showStatus("error", "Profil oluşturulurken bir hata oluştu: " + error.message);
        }

        toggleLoading(false);
        // Hata durumunda çıkış yapalım ki temiz kalsın
        await signOut(auth);
    }
};

const loginWithPopup = async () => {
    try {
        await setPersistence(auth, browserLocalPersistence);
        const result = await signInWithPopup(auth, provider);
        if (result?.user) await handleLoginSuccess(result.user);
    } catch (error) {
        handleAuthError(error);
    }
};

const handleAuthError = (error) => {
    console.error("Giriş Hatası:", error);
    toggleLoading(false);

    let msg = "Giriş işlemi tamamlanamadı.";
    switch (error.code) {
        case "auth/popup-blocked":
            msg = "Tarayıcınız açılır pencereyi engelledi. Lütfen izin verin.";
            break;
        case "auth/popup-closed-by-user":
            msg = "Giriş penceresini kapattınız. Tekrar deneyin.";
            break;
        case "auth/network-request-failed":
            msg = "İnternet bağlantınızı kontrol edin.";
            break;
        default:
            msg = error.message;
    }
    showStatus("error", msg);
};

export const logout = async () => {
    const user = auth.currentUser;
    clearUserCache(user?.uid);
    await signOut(auth);
    window.location.href = "/login.html";
};

// Event Listeners
if (googleLoginButton) {
    googleLoginButton.addEventListener("click", async () => {
        if (!hasAcceptedAgreement()) {
            showStatus("error", "Devam etmek için kullanıcı sözleşmesini okuduğunuzu ve kabul ettiğinizi onaylamalısınız.");
            return;
        }
        toggleLoading(true);
        statusBox.style.display = 'none'; // Önceki mesajı temizle
        await loginWithPopup();
    });
}

if (agreementCheckbox) {
    agreementCheckbox.addEventListener("change", updateLoginButtonState);
}

updateLoginButtonState();

// Redirect dönüşlerini yakala (Mobil cihazlar için gerekebilir)
getRedirectResult(auth)
    .then(async (result) => {
        if (result?.user) {
            toggleLoading(true);
            await handleLoginSuccess(result.user);
        }
    })
    .catch(handleAuthError);
