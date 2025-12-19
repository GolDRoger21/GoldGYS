import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export function protectPage(requireAdmin = false) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "/login.html";
        } else if (requireAdmin) {
            const token = await user.getIdTokenResult();
            if (!token.claims.admin) {
                alert("Yetkisiz Giriş!");
                window.location.href = "/pages/dashboard.html";
            }
        }
    });
}