import { initKonularPage, disposeKonularPage } from "../../konular-page.js";
import { injectScopedStyle, removeScopedStyle } from "./shell-style-scope.js";

const KONULAR_INLINE_STYLE_ID = "user-shell-konular-inline-style";
const KONULAR_ROUTE_STYLE_ID = "user-shell-konular-route-style";
const KONULAR_SCOPE_SELECTOR = '.user-shell-view[data-route-key="konular"]';

async function ensureRouteStyles() {
    if (document.getElementById(KONULAR_ROUTE_STYLE_ID)) return;

    const response = await fetch("/css/dashboard-route-overrides.css");
    if (!response.ok) {
        throw new Error(`Konular route stili yüklenemedi: HTTP ${response.status}`);
    }

    const cssText = await response.text();
    injectScopedStyle({
        styleId: KONULAR_ROUTE_STYLE_ID,
        cssText,
        scopeSelector: KONULAR_SCOPE_SELECTOR
    });
}

function ensureInlineScopedStyles(parsedDoc) {
    const styleSource = parsedDoc?.head?.querySelector("style");
    if (!styleSource?.textContent) return;

    injectScopedStyle({
        styleId: KONULAR_INLINE_STYLE_ID,
        cssText: styleSource.textContent,
        scopeSelector: KONULAR_SCOPE_SELECTOR
    });
}

async function renderTemplate(viewEl) {
    const response = await fetch("/pages/konular.html");
    if (!response.ok) {
        throw new Error(`Konular shell şablonu okunamadı: HTTP ${response.status}`);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    ensureInlineScopedStyles(parsed);

    const container = parsed.querySelector(".dashboard-container");
    if (!container) {
        throw new Error("Konular shell şablon yapısı geçersiz.");
    }

    viewEl.innerHTML = container.outerHTML;
}

export function createKonularShellModule({ viewEl }) {
    let initialized = false;

    return {
        async init() {
            if (initialized) return;
            await renderTemplate(viewEl);
            await ensureRouteStyles();
            await initKonularPage({ skipLayout: true });
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
            disposeKonularPage();
            removeScopedStyle(KONULAR_INLINE_STYLE_ID);
            removeScopedStyle(KONULAR_ROUTE_STYLE_ID);
        }
    };
}
