import { auth } from "./firebase-config.js";
import { ensureUserDocument } from "./user-profile.js";
import {
    GoogleAuthProvider,
    browserLocalPersistence,
    getRedirectResult,
    setPersistence,
    signInWithPopup,
    signInWithRedirect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const googleLoginButton = document.getElementById("googleLogin");
const loader = document.getElementById("loader");
const statusBox = document.getElementById("statusBox");

const provider = new GoogleAuthProvider();
let persistenceReady;

const ensurePersistence = () => {
    if (!persistenceReady) {
        persistenceReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
            showStatus("error", "Oturum ayarı yapılamadı. Lütfen sayfayı yenileyin ve tekrar deneyin.");
            throw error;
        });
    }
    return persistenceReady;
};

const toggleLoading = (isLoading) => {
    if (googleLoginButton) {
        googleLoginButton.disabled = isLoading;
        googleLoginButton.style.opacity = isLoading ? "0.6" : "1";
        googleLoginButton.style.pointerEvents = isLoading ? "none" : "auto";
    }
    if (loader) loader.style.display = isLoading ? "block" : "none";
};

const showStatus = (type, message) => {
    if (!statusBox) return;
    statusBox.innerHTML = message;
    statusBox.className = `status-box ${type === "error" ? "status-error" : "status-pending"}`;
    statusBox.style.display = "block";
};

const redirectToDashboard = () => {
    window.location.href = "/pages/dashboard.html";
};

const friendlyErrorMessage = (code = "") => {
    switch (code) {
        case "auth/popup-blocked":
            return "Tarayıcı açılır pencereleri engelliyor. İzni açıp tekrar deneyebilirsiniz.";
        case "auth/popup-closed-by-user":
            return "Giriş penceresi kapatıldı. Tekrar deneyin.";
        case "auth/network-request-failed":
            return "İnternet bağlantısında sorun var. Bağlantınızı kontrol edin.";
        case "auth/unauthorized-domain":
            return "Bu alan adı için Google girişi yetkilendirilmemiş. Yetkili alan adlarını kontrol edin.";
        case "auth/operation-not-allowed":
            return "Google ile giriş etkin değil. Firebase konsolundan Google yöntemini açın.";
        default:
            return "Giriş işlemi tamamlanamadı. Lütfen tekrar deneyin.";
    }
};

const handleLoginSuccess = async (user) => {
    if (!user) return;

    showStatus("pending", "Profil doğrulanıyor...");

    try {
        // ensureUserDocument artık statüsü de döndürüyor
        const userProfile = await ensureUserDocument(user);
        
        // Status kontrolü
        if (userProfile.status === "pending") {
            showStatus("pending", "Hesabınız onay bekleniyor, yönlendiriliyorsunuz...");
            setTimeout(() => {
                window.location.href = "/pages/pending-approval.html";
            }, 1500);
            return;
        }
        
        if (userProfile.status === "rejected") {
            showStatus("error", "❌ Başvurunuz reddedilmiştir. Sistem yöneticisine başvurunuz.");
            setTimeout(async () => {
                await auth.signOut();
                window.location.href = "/login.html";
            }, 2000);
            return;
        }
        
        if (userProfile.status === "suspended") {
            showStatus("error", "⚠️ Hesabınız askıya alınmıştır.");
            setTimeout(async () => {
                await auth.signOut();
                window.location.href = "/login.html";
            }, 2000);
            return;
        }

        // Active ise Dashboard'a yönlendir
        showStatus("pending", "Giriş başarılı, yönlendiriliyorsunuz...");
        redirectToDashboard();
    } catch (error) {
        console.error("Kullanıcı profili hatası", error);
        showStatus("error", "Profil yüklenirken hata oluştu. Lütfen tekrar deneyin.");
        setTimeout(() => {
            toggleLoading(false);
        }, 2000);
    }
};

const loginWithPopup = async () => {
    await ensurePersistence();
    const result = await signInWithPopup(auth, provider);
    if (result?.user) await handleLoginSuccess(result.user);
};

const loginWithRedirect = async () => {
    await ensurePersistence();
    await signInWithRedirect(auth, provider);
};

const handleRedirectResult = async () => {
    try {
        await ensurePersistence();
        const result = await getRedirectResult(auth);
        if (result?.user) await handleLoginSuccess(result.user);
    } catch (error) {
        console.error("Google redirect hatası", error);
        showStatus("error", friendlyErrorMessage(error?.code));
        toggleLoading(false);
    }
};

if (googleLoginButton) {
    googleLoginButton.addEventListener("click", async () => {
        toggleLoading(true);
        showStatus("pending", "Google ile giriş yapılıyor...");

        try {
            await loginWithPopup();
        } catch (error) {
            console.error("Google giriş hatası", error);
            const code = error?.code || "";

            if (code === "auth/popup-blocked") {
                try {
                    await loginWithRedirect();
                    return;
                } catch (redirectError) {
                    console.error("Google yönlendirme hatası", redirectError);
                    showStatus("error", friendlyErrorMessage(redirectError?.code));
                    toggleLoading(false);
                    return;
                }
            }

            showStatus("error", friendlyErrorMessage(code));
            toggleLoading(false);
        }
    });

    handleRedirectResult();
}
