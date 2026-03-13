import { initYanlislarimPage, disposeYanlislarimPage } from "../../yanlislarim-page.js";
import { injectScopedStyle, removeScopedStyle } from "./shell-style-scope.js";

const YANLISLARIM_INLINE_STYLE_ID = "user-shell-yanlislarim-inline-style";
const YANLISLARIM_ROUTE_STYLE_ID = "user-shell-yanlislarim-route-style";
const YANLISLARIM_SCOPE_SELECTOR = '.user-shell-view[data-route-key="yanlislarim"]';

async function ensureRouteStyles() {
    if (document.getElementById(YANLISLARIM_ROUTE_STYLE_ID)) return;

    const response = await fetch("/css/dashboard-route-overrides.css");
    if (!response.ok) {
        throw new Error(`Yanlışlarım route stili yüklenemedi: HTTP ${response.status}`);
    }

    const cssText = await response.text();
    injectScopedStyle({
        styleId: YANLISLARIM_ROUTE_STYLE_ID,
        cssText,
        scopeSelector: YANLISLARIM_SCOPE_SELECTOR
    });
}

function ensureInlineScopedStyles(parsedDoc) {
    const styleSource = parsedDoc?.head?.querySelector("style");
    if (!styleSource?.textContent) return;

    injectScopedStyle({
        styleId: YANLISLARIM_INLINE_STYLE_ID,
        cssText: styleSource.textContent,
        scopeSelector: YANLISLARIM_SCOPE_SELECTOR
    });
}

async function renderTemplate(viewEl) {
    const response = await fetch("/pages/yanlislarim.html");
    if (!response.ok) {
        throw new Error(`Yanlışlarım shell şablonu okunamadı: HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    ensureInlineScopedStyles(parsed);

    const container = parsed.querySelector(".dashboard-container");
    if (!container) {
        throw new Error("Yanlışlarım shell şablon yapısı geçersiz.");
    }

    viewEl.innerHTML = container.outerHTML;
}

export function createYanlislarimShellModule({ viewEl }) {
    let initialized = false;

    return {
        async init() {
            if (initialized) return;
            await renderTemplate(viewEl);
            await ensureRouteStyles();
            await initYanlislarimPage({ skipLayout: true });
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
            disposeYanlislarimPage();
            removeScopedStyle(YANLISLARIM_INLINE_STYLE_ID);
            removeScopedStyle(YANLISLARIM_ROUTE_STYLE_ID);
        }
    };
}
