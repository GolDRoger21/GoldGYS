import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function protectPage(options = {}) {
    let normalizedOptions = {};

    if (options === true) {
        normalizedOptions = { requireRole: "admin" };
    } else if (typeof options === "string") {
        normalizedOptions = { requireRole: options };
    } else if (Array.isArray(options)) {
        normalizedOptions = { allow: options };
    } else if (options && typeof options === "object") {
        normalizedOptions = options;
    }

    const { requireRole = null, allow = null } = normalizedOptions;

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "/login.html";
            return;
        }

        const allowedRoles = Array.isArray(allow)
            ? allow
            : (allow ? [allow] : (requireRole ? [requireRole] : []));

        if (allowedRoles.length === 0) {
            return; // No role restrictions
        }

        try {
            const token = await user.getIdTokenResult();
            const role = token.claims.role || (token.claims.admin ? "admin" : null);

            const isAuthorized = role && allowedRoles.includes(role);

            if (!isAuthorized) {
                const message = allowedRoles.length === 1
                    ? `Bu sayfa yalnızca ${allowedRoles[0]} yetkisine sahip kullanıcılar içindir.`
                    : `Bu sayfa ${allowedRoles.join(" veya ")} yetkisine sahip kullanıcılar içindir.`;

                alert(`${message} Dashboard'a yönlendiriliyorsunuz.`);
                window.location.href = "/pages/dashboard.html";
            }
        } catch (error) {
            console.error("Rol doğrulaması sırasında hata oluştu:", error);
            alert("Oturum doğrulaması sırasında bir hata oluştu. Lütfen tekrar giriş yapın.");
            window.location.href = "/login.html";
        }
    });
}
