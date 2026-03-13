import { initFavorilerPage, disposeFavorilerPage } from "../../favoriler-page.js";
import { injectScopedStyle, removeScopedStyle } from "./shell-style-scope.js";

const FAVORILER_INLINE_STYLE_ID = "user-shell-favoriler-inline-style";
const FAVORILER_ROUTE_STYLE_ID = "user-shell-favoriler-route-style";
const FAVORILER_SCOPE_SELECTOR = '.user-shell-view[data-route-key="favoriler"]';

async function ensureRouteStyles() {
    if (document.getElementById(FAVORILER_ROUTE_STYLE_ID)) return;

    const response = await fetch("/css/dashboard-route-overrides.css");
    if (!response.ok) {
        throw new Error(`Favoriler route stili yüklenemedi: HTTP ${response.status}`);
    }

    const cssText = await response.text();
    injectScopedStyle({
        styleId: FAVORILER_ROUTE_STYLE_ID,
        cssText,
        scopeSelector: FAVORILER_SCOPE_SELECTOR
    });
}

function ensureInlineScopedStyles(parsedDoc) {
    const styleSource = parsedDoc?.head?.querySelector("style");
    if (!styleSource?.textContent) return;

    injectScopedStyle({
        styleId: FAVORILER_INLINE_STYLE_ID,
        cssText: styleSource.textContent,
        scopeSelector: FAVORILER_SCOPE_SELECTOR
    });
}

async function renderTemplate(viewEl) {
    const response = await fetch("/pages/favoriler.html");
    if (!response.ok) {
        throw new Error(`Favoriler shell template okunamadı: HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    ensureInlineScopedStyles(parsed);

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
            await ensureRouteStyles();
            await initFavorilerPage({ skipLayout: true });
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
            disposeFavorilerPage();
            removeScopedStyle(FAVORILER_INLINE_STYLE_ID);
            removeScopedStyle(FAVORILER_ROUTE_STYLE_ID);
        }
    };
}
