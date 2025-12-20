import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function protectPage(options = {}) {
    let normalizedOptions = {};

    if (options === true) {
        normalizedOptions = { requireRole: "admin" };
    } else if (typeof options === "string") {
        normalizedOptions = { requireRole: options };
    } else if (Array.isArray(options)) {
        normalizedOptions = { allow: options };
    }

    const { allow = null, requireRole = null } = normalizedOptions;

    const allowedRoles = Array.isArray(allow)
        ? allow
        : (allow ? [allow] : (requireRole ? [requireRole] : []));

    // Sayfa yüklenmeden önce content'i gizle
    document.body.style.opacity = "0.5";
    document.body.style.pointerEvents = "none";

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "/login.html";
            return;
        }

        // --- YEDEK MEKANİZMA (Veritabanı erişilemezse devreye girer) ---
        const useFallbackRole = async (extraCheck = true) => {
            console.log("Firestore erişilemedi, Token Claims üzerinden kontrol ediliyor...");
            
            // Token'ı tazeleyerek en güncel yetkileri al
            const tokenResult = await auth.currentUser?.getIdTokenResult(true);
            
            const claimStatus = tokenResult?.claims?.status || (tokenResult?.claims?.admin ? "active" : null);
            const fallbackRole = tokenResult?.claims?.role || (tokenResult?.claims?.admin ? "admin" : "student");

            // Claim durumuna göre beklemeye yönlendir
            if (claimStatus && claimStatus !== "active" && !window.location.pathname.includes("pending-approval.html")) {
                window.location.href = "/pages/pending-approval.html";
                return false;
            }

            // Eğer ekstra rol kontrolü gerekiyorsa ve kullanıcı admin değilse
            if (extraCheck && allowedRoles.length > 0 && !allowedRoles.includes(fallbackRole) && fallbackRole !== 'admin') {
                alert("Bu sayfaya erişim yetkiniz yok (Token tabanlı kontrol).");
                window.location.href = "/pages/dashboard.html";
                return false;
            }

            // Giriş Başarılı
            document.body.style.opacity = "1";
            document.body.style.pointerEvents = "auto";
            return true;
        };

        try {
            const tokenResult = await user.getIdTokenResult(true);
            const claimRole = tokenResult.claims.role || (tokenResult.claims.admin ? "admin" : null);
            const claimStatus = tokenResult.claims.status || (tokenResult.claims.admin ? "active" : null);

            // 1. Kullanıcı Dokümanını Çek
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                // Doküman yoksa yedek mekanizmayı kullan
                await useFallbackRole();
                return;
            }

            const userData = userSnap.data();

            // Status alanı boşsa doldurmaya çalış
            const profileStatus = userData.status || claimStatus || "active";
            if (!userData.status) {
                try {
                    await setDoc(userRef, { status: profileStatus }, { merge: true });
                } catch (statusErr) {
                    console.warn("Kullanıcı status alanı güncellenemedi", statusErr);
                }
            }

            // 2. STATUS KONTROLÜ
            if (profileStatus !== "active" && !window.location.pathname.includes("pending-approval.html")) {
                window.location.href = "/pages/pending-approval.html";
                return;
            }

            if (profileStatus === "active" && window.location.pathname.includes("pending-approval.html")) {
                window.location.href = "/pages/dashboard.html";
                return;
            }

            // 3. Rol Kontrolü
            if (allowedRoles.length > 0) {
                const currentRole = userData.role || claimRole || "student";

                // Admin her yere girebilir
                if (currentRole === 'admin') {
                    document.body.style.opacity = "1";
                    document.body.style.pointerEvents = "auto";
                    return;
                }

                if (!allowedRoles.includes(currentRole)) {
                    alert("Bu sayfaya erişim yetkiniz yok.");
                    window.location.href = "/pages/dashboard.html";
                    return;
                }
            }

            // Tüm kontroller geçti
            document.body.style.opacity = "1";
            document.body.style.pointerEvents = "auto";

        } catch (error) {
            console.error("Yetki kontrolü hatası (Firestore):", error);
            
            // HATA OLDUĞUNDA LOGİN'E ATMAK YERİNE TOKEN İLE DEVAM ET
            // Bu, sorununuzu çözecek olan kısımdır.
            await useFallbackRole();
        }
    });
}