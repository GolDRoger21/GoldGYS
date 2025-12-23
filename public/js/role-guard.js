import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function protectPage(options = {}) {
    const { allow = null, requireRole = null } = normalizeOptions(options);
    const allowedRoles = getRoleList(allow, requireRole);

    // Sayfa yüklenmeden önce içeriği gizle
    document.body.style.opacity = "0";
    document.body.style.transition = "opacity 0.3s ease-in-out";

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            return redirectTo("/login.html");
        }

        try {
            const profile = await getUserProfile(user);

            // Durum ve rol kontrolü
            if (!isUserApproved(profile) && !isPendingPage()) {
                return redirectTo("/pages/pending-approval.html");
            }
            if (isUserApproved(profile) && isPendingPage()) {
                return redirectTo("/pages/dashboard.html");
            }
            if (!isUserAuthorized(profile, allowedRoles)) {
                alert("Bu sayfaya erişim yetkiniz bulunmuyor.");
                return redirectTo("/pages/dashboard.html");
            }

            // Tüm kontrollerden geçti, sayfayı göster
            document.body.style.opacity = "1";

        } catch (error) {
            console.error("Giriş koruma hatası:", error);
            // Hata durumunda, token tabanlı yedek kontrolü devreye al
            await fallbackControl(user, allowedRoles);
        }
    });
}

// --- Yardımcı Fonksiyonlar ---

function normalizeOptions(options) {
    if (options === true) return { requireRole: "admin" };
    if (typeof options === "string") return { requireRole: options };
    if (Array.isArray(options)) return { allow: options };
    return options || {};
}

function getRoleList(allow, requireRole) {
    const normalize = (val) => (Array.isArray(val) ? val : (val ? [val] : []));
    const allowed = normalize(allow);
    return allowed.length > 0 ? allowed : normalize(requireRole);
}

function redirectTo(url) {
    if (window.location.href !== url) {
        window.location.href = url;
    }
}

function isPendingPage() {
    return window.location.pathname.includes("pending-approval.html");
}

async function getUserProfile(user) {
    // Önce token'dan temel bilgileri al
    const tokenResult = await user.getIdTokenResult(true);
    const claims = tokenResult.claims || {};
    const baseProfile = {
        uid: user.uid,
        role: claims.role || (claims.admin ? "admin" : "student"),
        status: claims.status || (claims.admin ? "active" : "pending"),
    };

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            console.warn("Firestore'da kullanıcı dokümanı bulunamadı. Token bilgileri kullanılıyor.");
            return baseProfile; // Doküman yoksa, sadece token bilgisiyle devam et
        }

        const dbData = userSnap.data();
        
        // Veritabanı profilini, token bilgileriyle birleştir/güncelle
        const finalProfile = { ...baseProfile, ...dbData };
        
        // Eğer veritabanında `status` eksikse ve claim'de varsa, veritabanını güncelle
        if (!dbData.status && baseProfile.status) {
            await setDoc(userRef, { status: baseProfile.status }, { merge: true }).catch(err => 
                console.warn("Kullanıcı durumu güncellenemedi:", err)
            );
        }

        return finalProfile;

    } catch (dbError) {
        console.error("Firestore'dan profil alınamadı. Token bilgileri kullanılacak:", dbError);
        return baseProfile; // Veritabanı hatasında, sadece token bilgisiyle devam et
    }
}

function isUserApproved(profile) {
    return profile.status === "active";
}

function isUserAuthorized(profile, allowedRoles) {
    if (profile.role === 'admin') return true; // Admin her zaman yetkilidir
    if (allowedRoles.length === 0) return true; // Rol belirtilmemişse herkes yetkilidir
    return allowedRoles.includes(profile.role);
}

async function fallbackControl(user, allowedRoles) {
    console.log("Firestore erişilemedi, yalnızca Token Claims ile kontrol ediliyor...");
    try {
        const tokenResult = await user.getIdTokenResult(true);
        const claims = tokenResult.claims || {};
        const profile = {
            role: claims.role || (claims.admin ? "admin" : "student"),
            status: claims.status || (claims.admin ? "active" : "pending"),
        };

        if (!isUserApproved(profile) && !isPendingPage()) {
            return redirectTo("/pages/pending-approval.html");
        }
        if (!isUserAuthorized(profile, allowedRoles)) {
            alert("Bu sayfaya erişim yetkiniz yok (Yedek kontrol).");
            return redirectTo("/pages/dashboard.html");
        }
        
        // Yedek kontrolden geçti
        document.body.style.opacity = "1";

    } catch (tokenError) {
        console.error("Token alınamadı, giriş sayfasına yönlendiriliyor:", tokenError);
        redirectTo("/login.html");
    }
}
