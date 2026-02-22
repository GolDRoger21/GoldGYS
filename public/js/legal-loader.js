import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { CacheManager } from "./cache-manager.js";

const LEGAL_PAGE_TTL = 6 * 60 * 60 * 1000; // 6 saat

export async function loadLegalContent(slug) {
    const contentEl = document.querySelector('.policy-content');
    if (!contentEl) return;

    try {
        const cacheKey = `legal_page_${slug}`;
        const cached = await CacheManager.getData(cacheKey);
        if (cached?.cached && typeof cached.data === "string" && cached.data.trim()) {
            contentEl.innerHTML = cached.data;
            contentEl.classList.add('dynamic-loaded');
            return;
        }

        const docRef = doc(db, "legal_pages", slug);
        const snap = await getDoc(docRef);

        if (snap.exists() && snap.data().content) {
            // We have dynamic content, replace existing static body (keeping H1 if desired, or replacing all)
            // Typically the user edits the "body" of the policy.
            // Let's assume the editor manages the full content.
            // However, our template has <main class="policy-content"><h1>Title</h1>...
            // We should probably replace everything AFTER the H1, or replace the H1 too if the editor has it.
            // For simplicity and flexibility, let's replace the innerHTML of .policy-content, 
            // but we might want to preserve the Last Updated date if we track it.

            // Actually, let's just append an "Edit" note or date if we want.
            // But replacing innerHTML is the standard CMS behavior.
            contentEl.innerHTML = snap.data().content;
            await CacheManager.saveData(cacheKey, snap.data().content, LEGAL_PAGE_TTL);

            // Add a "Dynamic Content" class for styling tweaks if needed
            contentEl.classList.add('dynamic-loaded');
        } else {
            console.log("No dynamic content found for", slug, "using static fallback.");
        }
    } catch (error) {
        console.warn("Failed to load legal content:", error);
        // Fallback to static content naturally happens since we didn't touch it.
    }
}
