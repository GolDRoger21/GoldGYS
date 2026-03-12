import { initTopicMasteryPage, disposeTopicMasteryPage } from "../../topic-mastery-page.js";
import { injectScopedStyle, removeScopedStyle } from "./shell-style-scope.js";

const MASTERY_INLINE_STYLE_ID = "user-shell-topic-mastery-inline-style";
const MASTERY_SCOPE_SELECTOR = '.user-shell-view[data-route-key="konu-hakimiyet"]';

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

    const styleSource = parsedDoc.head.querySelector("style");
    if (styleSource?.textContent) {
        injectScopedStyle({
            styleId: MASTERY_INLINE_STYLE_ID,
            cssText: styleSource.textContent,
            scopeSelector: MASTERY_SCOPE_SELECTOR
        });
    }
}

async function renderTemplate(viewEl) {
    const response = await fetch("/pages/konu-hakimiyet.html");
    if (!response.ok) {
        throw new Error(`Konu hakimiyet shell şablonu okunamadı: HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    ensureHeadAssets(parsed);

    const container = parsed.querySelector(".dashboard-container.topic-mastery-page")
        || parsed.querySelector(".dashboard-container");
    if (!container) {
        throw new Error("Konu hakimiyet shell şablon yapısı geçersiz.");
    }

    viewEl.innerHTML = container.outerHTML;
}

export function createTopicMasteryShellModule({ viewEl }) {
    let initialized = false;

    return {
        async init() {
            if (initialized) return;
            await renderTemplate(viewEl);
            await initTopicMasteryPage({ skipLayout: true });
            initialized = true;
        },
        async activate() {
            if (!initialized) {
                await this.init();
            }
        },
        async deactivate() {
            // Keep DOM warm for route transitions.
        },
        async dispose() {
            disposeTopicMasteryPage();
            removeScopedStyle(MASTERY_INLINE_STYLE_ID);
        }
    };
}
