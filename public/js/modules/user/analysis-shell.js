import { disposeAnalysisPage, initAnalysisPage } from "../../analysis.js";
import { injectScopedStyle, removeScopedStyle } from "./shell-style-scope.js";

const ANALYSIS_STYLE_ID = "user-shell-analysis-scoped-style";
const ANALYSIS_CHART_SCRIPT_ID = "user-shell-analysis-chartjs";
const ANALYSIS_SCOPE_SELECTOR = '.user-shell-view[data-route-key="analiz"]';

async function ensureAnalysisStyles() {
    if (document.getElementById(ANALYSIS_STYLE_ID)) return;

    const response = await fetch("/css/analysis.css");
    if (!response.ok) {
        throw new Error(`Analiz stili yüklenemedi: HTTP ${response.status}`);
    }
    const cssText = await response.text();
    injectScopedStyle({
        styleId: ANALYSIS_STYLE_ID,
        cssText,
        scopeSelector: ANALYSIS_SCOPE_SELECTOR
    });
}

async function ensureChartJs() {
    if (window.Chart) return;
    if (document.getElementById(ANALYSIS_CHART_SCRIPT_ID)) {
        await new Promise((resolve) => {
            const waitForChart = () => {
                if (window.Chart) {
                    resolve();
                    return;
                }
                setTimeout(waitForChart, 40);
            };
            waitForChart();
        });
        return;
    }

    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.id = ANALYSIS_CHART_SCRIPT_ID;
        script.src = "https://cdn.jsdelivr.net/npm/chart.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Chart.js yüklenemedi."));
        document.head.appendChild(script);
    });
}

async function renderAnalysisTemplate(viewEl) {
    const response = await fetch("/pages/analiz.html");
    if (!response.ok) {
        throw new Error(`Analiz shell template okunamadı: HTTP ${response.status}`);
    }
    const html = await response.text();
    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, "text/html");
    const container = parsed.querySelector(".dashboard-container.analysis-page")
        || parsed.querySelector(".dashboard-container");
    if (!container) {
        throw new Error("Analiz shell template yapısı geçersiz.");
    }

    viewEl.innerHTML = container.outerHTML;
}

export function createAnalysisShellModule({ viewEl }) {
    let initialized = false;

    return {
        async init() {
            if (initialized) return;
            await ensureAnalysisStyles();
            await ensureChartJs();
            await renderAnalysisTemplate(viewEl);
            initAnalysisPage();
            initialized = true;
        },
        async activate() {
            if (!initialized) {
                await this.init();
            }
        },
        async deactivate() {
            // Analysis module keeps in-memory state for fast re-entry.
        },
        async dispose() {
            disposeAnalysisPage();
            removeScopedStyle(ANALYSIS_STYLE_ID);
        }
    };
}
