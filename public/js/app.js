import { auth } from "./firebase-config.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ensureUserDocument } from "./user-profile.js";

async function loadComponent(id, path) {
    const el = document.getElementById(id);
    if(el) {
        const res = await fetch(path);
        el.innerHTML = await res.text();
        if(id === 'sidebar-placeholder') setupSidebar();
    }
}

function setupSidebar() {
    const btnLogout = document.getElementById("btnLogout");
    if(btnLogout) {
        btnLogout.addEventListener("click", () => {
            signOut(auth).then(() => window.location.href = "/login.html");
        });
    }
    onAuthStateChanged(auth, async (user) => {
        if(user) {
            const profile = await ensureUserDocument(user);
            const token = await user.getIdTokenResult();
            const hasAdminRole = token.claims.admin
                || token.claims.role === "admin"
                || profile?.role === "admin"
                || profile?.roles?.includes("admin");

            if(hasAdminRole) {
                document.querySelectorAll(".admin-link, .admin-only").forEach(l => l.style.display="block");
            }
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    loadComponent("header-placeholder", "/partials/header.html");
    loadComponent("sidebar-placeholder", "/partials/sidebar.html");
});
