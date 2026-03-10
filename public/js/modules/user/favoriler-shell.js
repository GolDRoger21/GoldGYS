import { initFavorilerPage, disposeFavorilerPage } from "../../favoriler-page.js";
import { injectScopedStyle, removeScopedStyle } from "./shell-style-scope.js";

const FAVORILER_INLINE_STYLE_ID = "user-shell-favoriler-inline-style";
const FAVORILER_SCOPE_SELECTOR = '.user-shell-view[data-route-key="favoriler"]';

function ensureHeadAssets(parsedDoc) {
    if (!parsedDoc?.head) return;

    parsedDoc.querySelectorAll('link[rel="stylesheet"]').forEach((linkEl) => {
        const href = linkEl.getAttribute("href");
        if (!href) return;
        const resolvedHref = new URL(href, window.location.origin).pathname;
        if (document.querySelector(`link[rel="stylesheet"][href="${resolvedHref}"]`)) return;
        const clone = document.createElement("link");
        clone.rel = "stylesheet";
        clone.href = resolvedHref;
        document.head.appendChild(clone);
    });

    if (!document.getElementById(FAVORILER_INLINE_STYLE_ID)) {
        const styleSource = parsedDoc.head.querySelector("style");
        if (styleSource?.textContent) {
            injectScopedStyle({
                styleId: FAVORILER_INLINE_STYLE_ID,
                cssText: styleSource.textContent,
                scopeSelector: FAVORILER_SCOPE_SELECTOR
            });
        }
    }
}

async function renderTemplate(viewEl) {
    const response = await fetch("/pages/favoriler.html");
    if (!response.ok) {
        throw new Error(`Favoriler shell template okunamadı: HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    ensureHeadAssets(parsed);

    const container = parsed.querySelector(".dashboard-container");
    if (!container) {
        throw new Error("Favoriler shell template yapısı geçersiz.");
    }
    viewEl.innerHTML = container.outerHTML;
}

export function createFavorilerShellModule({ viewEl }) {
    let initialized = false;

    return {
        async init() {
            if (initialized) return;
            await renderTemplate(viewEl);
            await initFavorilerPage({ skipLayout: true });
            initialized = true;
        },
        async activate() {
            if (!initialized) {
                await this.init();
            }
        },
        async deactivate() {
            // Sıcak geçiş için DOM'u koruyoruz.
        },
        async dispose() {
            disposeFavorilerPage();
            removeScopedStyle(FAVORILER_INLINE_STYLE_ID);
        }
    };
}
