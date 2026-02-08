// public/js/role-guard.js
import { auth } from "./firebase-config.js";
import { showToast } from "./notifications.js";
import { getUserProfile } from "./user-profile.js";

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
                    showToast("Bu alana erişim yetkiniz bulunmuyor.", "error");
                    setTimeout(() => {
                        window.location.href = "/dashboard";
                    }, 1000);
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

/**
 * Standart kullanıcı sayfaları için oturum ve hesap durumu kontrolü.
 * Oturum yoksa login'e, hesap durumu uygunsuzsa ilgili sayfaya yönlendirir.
 * @param {{ allowPending?: boolean }} options
 * @returns {Promise<{user: object, profile: object | null}>}
 */
export function protectPage(options = {}) {
    const { allowPending = false } = options;

    return new Promise((resolve, reject) => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            unsubscribe();

            if (!user) {
                console.warn("Oturum açılmamış, login'e yönlendiriliyor.");
                window.location.href = "/login.html";
                reject("No user");
                return;
            }

            try {
                const profile = await getUserProfile(user.uid);
                const status = profile?.status;

                if (status === "pending" && !allowPending) {
                    window.location.href = "/pending-approval";
                    reject("Pending approval");
                    return;
                }

                if (status === "rejected") {
                    showToast("Üyelik başvurunuz reddedilmiştir.", "error");
                    window.location.href = "/login.html";
                    reject("Rejected");
                    return;
                }

                if (status === "suspended") {
                    showToast("Hesabınız askıya alınmıştır.", "error");
                    window.location.href = "/login.html";
                    reject("Suspended");
                    return;
                }

                resolve({ user, profile: profile || null });
            } catch (error) {
                console.error("Profil kontrolü hatası:", error);
                resolve({ user, profile: null });
            }
        });
    });
}
