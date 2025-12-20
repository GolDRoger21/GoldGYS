import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

    // Sayfa yüklenmeden önce content'i gizle (emniyetçi önlem)
    document.body.style.opacity = "0.5";
    document.body.style.pointerEvents = "none";

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "/login.html";
            return;
        }

        try {
            // 1. Kullanıcı Dokümanını Çek (Status kontrolü için)
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                // Doküman yoksa güvenli tarafta kalıp logout yap
                await auth.signOut();
                window.location.href = "/login.html";
                return;
            }

            const userData = userSnap.data();
            
            // 2. STATUS KONTROLÜ (KRİTİK BÖLÜM)
            // Eğer sayfa 'pending-approval.html' değilse ve kullanıcı 'active' değilse
            if (userData.status !== "active" && !window.location.pathname.includes("pending-approval.html")) {
                window.location.href = "/pages/pending-approval.html";
                return;
            }

            // Eğer kullanıcı active ise ama 'pending-approval' sayfasındaysa dashboard'a yolla
            if (userData.status === "active" && window.location.pathname.includes("pending-approval.html")) {
                window.location.href = "/pages/dashboard.html";
                return;
            }

            // 3. Rol Kontrolü (Varsa uygulan)
            const allowedRoles = Array.isArray(allow)
                ? allow
                : (allow ? [allow] : (requireRole ? [requireRole] : []));

            if (allowedRoles.length > 0) {
                // Dokümandaki role öncelik veriyoruz (daha güncel olabilir)
                const currentRole = userData.role || "student"; 
                
                // Admin her yere girebilsin
                if (currentRole === 'admin') {
                    // İzin ver
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

            // Tüm kontroller geçti, sayfayı göster
            document.body.style.opacity = "1";
            document.body.style.pointerEvents = "auto";

        } catch (error) {
            console.error("Yetki kontrolü hatası:", error);
            // Hata durumunda güvenli tarafta kalıp login'e yönlendir
            window.location.href = "/login.html";
        }
    });
}
