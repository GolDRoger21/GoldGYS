// public/js/role-guard.js
import { auth } from "./firebase-config.js";

/**
 * Kullanıcının yetkisini kontrol eder ve yetkisiz ise yönlendirir.
 * @returns {Promise<{role: string, user: object}>}
 */
export async function requireAdminOrEditor() {
    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe(); // Dinleyiciyi tek seferlik çalıştır ve kapat

            if (!user) {
                console.warn("Oturum açılmamış, login'e yönlendiriliyor.");
                window.location.href = "/login.html";
                reject("No user");
                return;
            }

            try {
                // Firebase Custom Claims kontrolü (Admin/Editor yetkisi token içinde tutulur)
                const idTokenResult = await user.getIdTokenResult();
                const claims = idTokenResult.claims;

                if (claims.admin) {
                    resolve({ role: "admin", user });
                } else if (claims.editor) {
                    resolve({ role: "editor", user });
                } else {
                    console.warn("Yetkisiz erişim denemesi!");
                    alert("Bu alana erişim yetkiniz yok.");
                    window.location.href = "/pages/dashboard.html";
                    reject("Unauthorized");
                }
            } catch (error) {
                console.error("Yetki kontrolü hatası:", error);
                window.location.href = "/login.html";
                reject(error);
            }
        });
    });
}