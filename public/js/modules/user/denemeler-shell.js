import { disposeDenemelerPage, initDenemelerPage } from "../../denemeler-page.js";
import { injectScopedStyle, removeScopedStyle, fetchCss } from "./shell-style-scope.js";

const DENEMELER_INLINE_STYLE_ID = "user-shell-denemeler-inline-style";
const DENEMELER_ROUTE_STYLE_ID = "user-shell-denemeler-route-style";
const DENEMELER_SCOPE_SELECTOR = '.user-shell-view[data-route-key="denemeler"]';

async function ensureRouteStyles() {
    if (document.getElementById(DENEMELER_ROUTE_STYLE_ID)) return;

    const cssText = await fetchCss("/css/dashboard-route-overrides.css");
    injectScopedStyle({
        styleId: DENEMELER_ROUTE_STYLE_ID,
        cssText,
        scopeSelector: DENEMELER_SCOPE_SELECTOR
    });
}

function ensureInlineScopedStyles(parsedDoc) {
    const styleSource = parsedDoc?.head?.querySelector("style");
    if (!styleSource?.textContent) return;

    injectScopedStyle({
        styleId: DENEMELER_INLINE_STYLE_ID,
        cssText: styleSource.textContent,
        scopeSelector: DENEMELER_SCOPE_SELECTOR
    });
}

async function renderTemplate(viewEl) {
    const response = await fetch("/pages/denemeler.html");
    if (!response.ok) {
        throw new Error(`Denemeler shell template okunamadı: HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    ensureInlineScopedStyles(parsed);

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
            await ensureRouteStyles();
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
            disposeDenemelerPage();
            removeScopedStyle(DENEMELER_INLINE_STYLE_ID);
            removeScopedStyle(DENEMELER_ROUTE_STYLE_ID);
        }
    };
}
