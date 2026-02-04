import { auth, db } from "../firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const MAINTENANCE_DOC_REF = doc(db, "maintenanceConfig", "main");

export const MaintenanceGuard = {
    /**
     * Checks if the system is in maintenance mode and redirects normal users.
     * Should be called at the very start of the app initialization.
     */
    async check() {
        // Skip check if we are already on the maintenance page to avoid loops
        if (window.location.pathname.includes("/maintenance.html")) {
            return;
        }

        // Allow bypassing maintenance via URL parameter (e.g. for emergency admin access hidden entry)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("force") === "true") {
            return;
        }

        try {
            const snap = await getDoc(MAINTENANCE_DOC_REF);
            if (!snap.exists()) return;

            const config = snap.data();
            const now = new Date();

            // Check if maintenance is active
            // 1. Manual Toggle is ON
            // 2. OR Current time is within the scheduled window
            let isActive = config.maintenanceMode === true;
            
            if (!isActive && config.windowStart && config.windowEnd) {
                const start = config.windowStart.toDate();
                const end = config.windowEnd.toDate();
                if (now >= start && now <= end) {
                    isActive = true;
                }
            }

            if (isActive) {
                // If maintenance is active, check if the user is exempted (Admin/Editor)
                const user = auth.currentUser;
                
                if (user) {
                    try {
                        const tokenResult = await user.getIdTokenResult();
                        const claims = tokenResult.claims;
                        // Admins and Editors can bypass maintenance
                        if (claims.admin || claims.editor) {
                            return; 
                        }
                    } catch (e) {
                        console.error("Token claims check failed", e);
                         // If token check fails, assume safe and block
                    }
                }

                // If we are here, maintenance is active and user is either not logged in 
                // or not an admin/editor. 
                // REDIRECT TO MAINTENANCE PAGE
                window.location.href = "/maintenance.html";
            }

        } catch (error) {
            console.error("Maintenance check failed:", error);
            // Fallback: In case of error (e.g. network issue), do we block or allow?
            // Usually valid to allow if config can't be fetched to prevent accidental lockout, 
            // OR block if security is paramount. Here we allow (do nothing).
        }
    }
};
