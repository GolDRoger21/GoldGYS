import { initDenemelerPage } from "../../denemeler-page.js";

const DENEMELER_INLINE_STYLE_ID = "user-shell-denemeler-inline-style";

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

    if (!document.getElementById(DENEMELER_INLINE_STYLE_ID)) {
        const styleSource = parsedDoc.head.querySelector("style");
        if (styleSource?.textContent) {
            const style = document.createElement("style");
            style.id = DENEMELER_INLINE_STYLE_ID;
            style.textContent = styleSource.textContent;
            document.head.appendChild(style);
        }
    }
}

async function renderTemplate(viewEl) {
    const response = await fetch("/pages/denemeler.html");
    if (!response.ok) {
        throw new Error(`Denemeler shell template okunamadı: HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    ensureHeadAssets(parsed);

    const container = parsed.querySelector(".dashboard-container.denemeler-page")
        || parsed.querySelector(".dashboard-container");
    if (!container) {
        throw new Error("Denemeler shell template yapısı geçersiz.");
    }
    viewEl.innerHTML = container.outerHTML;
}

export function createDenemelerShellModule({ viewEl }) {
    let initialized = false;

    return {
        async init() {
            if (initialized) return;
            await renderTemplate(viewEl);
            await initDenemelerPage({ skipLayout: true });
            initialized = true;
        },
        async activate() {
            if (!initialized) {
                await this.init();
            }
        },
        async deactivate() {
            // Keep rendered DOM for warm transitions.
        },
        async dispose() {
            // Intentionally keep state for quick re-entry.
        }
    };
}
