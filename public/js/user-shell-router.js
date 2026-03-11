import { analytics } from "./firebase-config.js";
import { logEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const SHELL_ROOT_PATH = "/dashboard";
const SCROLL_STORAGE_KEY = "user_shell_scroll_v1";
const PROGRESS_STYLE_ID = "user-shell-progress-style";
const TRANSITION_METRICS_KEY = "user_shell_transition_metrics_v1";
const TOPIC_SCROLLBAR_CLASS = "user-shell-topic-scrollbars-hidden";

const ROUTES = {
    dashboard: {
        key: "dashboard",
        hash: "#dashboard",
        legacyPath: "/dashboard",
        title: "Genel Bakış | GOLD GYS",
        focusLabel: "Genel Bakış",
        focusTarget: "#welcomeMsg",
        pageId: "dashboard",
        moduleKind: "dashboard",
        prefetchPriority: "low",
        scrollPolicy: "restore"
    },
    konular: {
        key: "konular",
        hash: "#konular",
        legacyPath: "/konular",
        title: "Dersler | GOLD GYS",
        focusLabel: "Dersler",
        focusTarget: "#searchInput",
        pageId: "lessons",
        moduleKind: "native",
        prefetchPriority: "high",
        scrollPolicy: "restore"
    },
    denemeler: {
        key: "denemeler",
        hash: "#denemeler",
        legacyPath: "/denemeler",
        title: "Denemeler | GOLD GYS",
        focusLabel: "Denemeler",
        focusTarget: "#examCountNote",
        pageId: "trials",
        moduleKind: "native",
        prefetchPriority: "high",
        scrollPolicy: "restore"
    },
    yanlislarim: {
        key: "yanlislarim",
        hash: "#yanlislarim",
        legacyPath: "/yanlislarim",
        title: "Yanlışlarım | GOLD GYS",
        focusLabel: "Yanlışlarım",
        focusTarget: "#filteredCount",
        pageId: "mistakes",
        moduleKind: "native",
        prefetchPriority: "low",
        scrollPolicy: "restore"
    },
    favoriler: {
        key: "favoriler",
        hash: "#favoriler",
        legacyPath: "/favoriler",
        title: "Favoriler | GOLD GYS",
        focusLabel: "Favoriler",
        focusTarget: "#filteredCount",
        pageId: "favorites",
        moduleKind: "native",
        prefetchPriority: "low",
        scrollPolicy: "restore"
    },
    analiz: {
        key: "analiz",
        hash: "#analiz",
        legacyPath: "/analiz",
        title: "Raporlar | GOLD GYS",
        focusLabel: "Raporlar",
        focusTarget: "#lastUpdate",
        pageId: "analysis",
        moduleKind: "native",
        prefetchPriority: "high",
        scrollPolicy: "restore"
    },
    profil: {
        key: "profil",
        hash: "#profil",
        legacyPath: "/profil",
        title: "Profilim | GOLD GYS",
        focusLabel: "Profilim",
        focusTarget: "#profileNameMain",
        pageId: "profile",
        moduleKind: "native",
        prefetchPriority: "low",
        scrollPolicy: "restore"
    }
};

const LEGACY_PATH_TO_ROUTE = Object.values(ROUTES).reduce((acc, route) => {
    acc[route.legacyPath] = route.key;
    return acc;
}, {});

function getPathname() {
    const pathname = window.location.pathname || "/";
    return pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function getQueryParams() {
    return new URLSearchParams(window.location.search);
}

function isShellEmbedMode() {
    return getQueryParams().get("shell") === "1";
}

function getRouteFromHash() {
    const hash = (window.location.hash || "").replace(/^#/, "").trim();
    if (!hash) return "dashboard";
    if (hash.startsWith("konu/")) return hash; // Dynamic topic route
    return ROUTES[hash] ? hash : "dashboard";
}

function setHashForRoute(routeKey, options = {}) {
    const isDynamicKonu = routeKey.startsWith("konu/");
    const route = isDynamicKonu ? { hash: `#${routeKey}`, key: routeKey } : (ROUTES[routeKey] || ROUTES.dashboard);
    const hash = route.hash;
    const currentHash = window.location.hash || "";
    if (currentHash === hash) return;

    if (options.replace === true) {
        const search = window.location.search || "";
        window.history.replaceState(null, "", `${SHELL_ROOT_PATH}${search}${hash}`);
        return;
    }
    window.location.hash = route.key;
}

function readScrollState() {
    try {
        const raw = sessionStorage.getItem(SCROLL_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function writeScrollState(state) {
    try {
        sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(state));
    } catch {
        // noop
    }
}

function saveScroll(routeKey) {
    const state = readScrollState();
    state[routeKey] = window.scrollY || 0;
    writeScrollState(state);
}

function restoreScroll(routeKey) {
    const state = readScrollState();
    const y = Number(state[routeKey] || 0);
    window.scrollTo({ top: Number.isFinite(y) ? y : 0, behavior: "auto" });
}

function trackPageView(route) {
    if (!analytics || !route) return;
    const eventKey = `${route.legacyPath}${route.hash}`;
    if (trackPageView.lastEventKey === eventKey) return;
    trackPageView.lastEventKey = eventKey;

    try {
        logEvent(analytics, "page_view", {
            page_title: route.title,
            page_location: `${window.location.origin}${SHELL_ROOT_PATH}${route.hash}`,
            page_path: `${SHELL_ROOT_PATH}${route.hash}`
        });
    } catch (error) {
        console.warn("User shell analytics gönderimi atlandı:", error);
    }
}

function readTransitionMetrics() {
    try {
        const raw = sessionStorage.getItem(TRANSITION_METRICS_KEY);
        if (!raw) return { all: [], warm: [], cold: [] };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return { all: [], warm: [], cold: [] };
        return {
            all: Array.isArray(parsed.all) ? parsed.all : [],
            warm: Array.isArray(parsed.warm) ? parsed.warm : [],
            cold: Array.isArray(parsed.cold) ? parsed.cold : []
        };
    } catch {
        return { all: [], warm: [], cold: [] };
    }
}

function writeTransitionMetrics(metrics) {
    try {
        sessionStorage.setItem(TRANSITION_METRICS_KEY, JSON.stringify(metrics));
    } catch {
        // noop
    }
}

function calculateP95(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
    return sorted[idx];
}

function updateTransitionMetrics(transitionMs, transitionType) {
    const cap = 100;
    const metrics = readTransitionMetrics();
    metrics.all.push(transitionMs);
    if (transitionType === "warm") metrics.warm.push(transitionMs);
    if (transitionType === "cold") metrics.cold.push(transitionMs);
    metrics.all = metrics.all.slice(-cap);
    metrics.warm = metrics.warm.slice(-cap);
    metrics.cold = metrics.cold.slice(-cap);
    writeTransitionMetrics(metrics);

    return {
        p95All: calculateP95(metrics.all),
        p95Warm: calculateP95(metrics.warm),
        p95Cold: calculateP95(metrics.cold),
        countAll: metrics.all.length,
        countWarm: metrics.warm.length,
        countCold: metrics.cold.length
    };
}

function ensureProgressStyle() {
    if (document.getElementById(PROGRESS_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = PROGRESS_STYLE_ID;
    style.textContent = `
      .user-shell-progress {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        z-index: 1200;
        pointer-events: none;
        opacity: 0;
        transition: opacity .15s ease;
        background: transparent;
      }
      .user-shell-progress.active { opacity: 1; }
      .user-shell-progress::before {
        content: "";
        display: block;
        width: 35%;
        height: 100%;
        background: linear-gradient(90deg, rgba(191,149,63,.2), rgba(191,149,63,.95));
        animation: user-shell-progress-bar 1s ease-in-out infinite;
      }
      @keyframes user-shell-progress-bar {
        0% { transform: translateX(-40%); }
        100% { transform: translateX(310%); }
      }
      .user-shell-main {
        position: relative;
        min-height: 0;
      }
      .user-shell-view {
        width: 100%;
      }
      .user-shell-view[data-route-key^="konu/"] {
        background: var(--bg-body-gradient);
      }
      .user-shell-view[hidden] {
        display: none !important;
      }
      .user-shell-frame {
        width: 100%;
        border: 0;
        min-height: 320px;
        display: block;
        overflow: hidden;
        background: transparent;
      }
      .user-shell-focus-anchor {
        position: absolute;
        left: -9999px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      }
      .user-shell-live-region {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }
      html.${TOPIC_SCROLLBAR_CLASS},
      body.${TOPIC_SCROLLBAR_CLASS} {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      html.${TOPIC_SCROLLBAR_CLASS}::-webkit-scrollbar,
      body.${TOPIC_SCROLLBAR_CLASS}::-webkit-scrollbar {
        width: 0;
        height: 0;
      }
    `;
    document.head.appendChild(style);
}

class BaseShellModule {
    constructor(route) {
        this.route = route;
        this.initialized = false;
        this.subscriptions = [];
    }

    addSubscription(unsubscribe) {
        if (typeof unsubscribe === "function") this.subscriptions.push(unsubscribe);
    }

    clearSubscriptions() {
        this.subscriptions.forEach((unsubscribe) => {
            try { unsubscribe(); } catch { /* noop */ }
        });
        this.subscriptions = [];
    }

    async init() {
        this.initialized = true;
    }

    async activate() {
        if (!this.initialized) await this.init();
    }

    async deactivate() {
        this.clearSubscriptions();
    }

    async dispose() {
        this.clearSubscriptions();
    }
}

class DashboardModule extends BaseShellModule {
    constructor(route, viewEl) {
        super(route);
        this.viewEl = viewEl;
    }

    async activate() {
        await super.activate();
        if (this.viewEl) this.viewEl.hidden = false;
    }

    async deactivate() {
        await super.deactivate();
        if (this.viewEl) this.viewEl.hidden = true;
    }
}

class IframeModule extends BaseShellModule {
    constructor(route, viewEl) {
        super(route);
        this.viewEl = viewEl;
        this.iframe = null;
        this.loaded = false;
        this.loadingPromise = null;
    }

    async init() {
        if (this.initialized) return;
        await super.init();
        this.iframe = document.createElement("iframe");
        this.iframe.className = "user-shell-frame";
        this.iframe.setAttribute("title", this.route.focusLabel);
        this.iframe.setAttribute("loading", "eager");
        this.iframe.setAttribute("scrolling", "no");
        this.iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
        this.viewEl.appendChild(this.iframe);
    }

    buildSrc() {
        return `${this.route.legacyPath}?shell=1`;
    }

    async loadIfNeeded() {
        if (this.loaded) return;
        if (this.loadingPromise) return this.loadingPromise;
        this.loadingPromise = new Promise((resolve, reject) => {
            const onLoad = () => {
                cleanup();
                this.loaded = true;
                resolve();
            };
            const onError = () => {
                cleanup();
                reject(new Error(`${this.route.key} iframe yüklenemedi.`));
            };
            const cleanup = () => {
                this.iframe.removeEventListener("load", onLoad);
                this.iframe.removeEventListener("error", onError);
            };
            this.iframe.addEventListener("load", onLoad, { once: true });
            this.iframe.addEventListener("error", onError, { once: true });
            this.iframe.src = this.buildSrc();
        }).finally(() => {
            this.loadingPromise = null;
        });
        return this.loadingPromise;
    }

    async prefetch() {
        if (!this.initialized) await this.init();
        if (!this.loaded) {
            await this.loadIfNeeded();
            if (this.viewEl) this.viewEl.hidden = true;
        }
    }

    async activate() {
        await super.activate();
        if (!this.initialized) await this.init();
        await this.loadIfNeeded();
        if (this.viewEl) this.viewEl.hidden = false;
    }

    async deactivate() {
        await super.deactivate();
        if (this.viewEl) this.viewEl.hidden = true;
    }
}

class NativeModule extends BaseShellModule {
    constructor(route, viewEl, moduleLoader) {
        super(route);
        this.viewEl = viewEl;
        this.moduleLoader = moduleLoader;
        this.impl = null;
    }

    async init() {
        if (this.initialized) return;
        await super.init();
        this.impl = await this.moduleLoader({ route: this.route, viewEl: this.viewEl });
        if (this.impl && typeof this.impl.init === "function") {
            await this.impl.init();
        }
    }

    async prefetch() {
        if (!this.initialized) await this.init();
    }

    async activate() {
        await super.activate();
        if (!this.initialized) await this.init();
        if (this.viewEl) this.viewEl.hidden = false;
        if (this.impl && typeof this.impl.activate === "function") {
            await this.impl.activate();
        }
    }

    async deactivate() {
        await super.deactivate();
        if (this.impl && typeof this.impl.deactivate === "function") {
            await this.impl.deactivate();
        }
        if (this.viewEl) this.viewEl.hidden = true;
    }

    async dispose() {
        await super.dispose();
        if (this.impl && typeof this.impl.dispose === "function") {
            await this.impl.dispose();
        }
        this.impl = null;
    }
}

function createProgressBar() {
    const bar = document.createElement("div");
    bar.className = "user-shell-progress";
    document.body.appendChild(bar);
    return {
        start() { bar.classList.add("active"); },
        stop() { bar.classList.remove("active"); }
    };
}

function resolveUserShellReason(siteConfig) {
    const params = getQueryParams();
    if (isShellEmbedMode()) {
        return { enabled: false, source: "embed", reason: "shell embed mode active" };
    }
    if (params.get("shellV2") === "0") {
        return { enabled: false, source: "query", reason: "shellV2=0 override" };
    }
    if (params.get("shellV2") === "1") {
        return { enabled: true, source: "query", reason: "shellV2=1 override" };
    }
    if (localStorage.getItem("userShellV2") === "1") {
        return { enabled: true, source: "localStorage", reason: "localStorage userShellV2=1 override" };
    }
    if (siteConfig?.features?.userShellV2 === true) {
        return { enabled: true, source: "remoteConfig", reason: "siteConfig.features.userShellV2=true" };
    }
    return { enabled: false, source: "remoteConfig", reason: "siteConfig.features.userShellV2 is false" };
}

export function shouldSkipEmbeddedChrome() {
    return isShellEmbedMode();
}

export function getLegacyRouteKey(pathname = getPathname()) {
    return LEGACY_PATH_TO_ROUTE[pathname] || null;
}

export function resolveUserShellState(siteConfig) {
    const stateReason = resolveUserShellReason(siteConfig);
    return {
        enabled: stateReason.enabled,
        source: stateReason.source,
        reason: stateReason.reason,
        isEmbed: isShellEmbedMode(),
        pathname: getPathname(),
        legacyRouteKey: getLegacyRouteKey()
    };
}

export function maybeRedirectLegacyPathToShell(siteConfig) {
    const state = resolveUserShellState(siteConfig);
    
    const params = new URLSearchParams(window.location.search);
    if (params.get("shell") === "1" || state.isEmbed) return false;
    
    if (!state.enabled) return false;
    
    // Check if it's a dynamic konu route
    const isKonuPath = state.pathname && state.pathname.startsWith('/konu/');
    
    if (!state.legacyRouteKey && !isKonuPath) return false;
    if (state.pathname === SHELL_ROOT_PATH) return false;

    params.delete("shell");
    const search = params.toString();
    
    let targetHash = state.legacyRouteKey;
    if (isKonuPath) {
       targetHash = state.pathname.replace(/^\//, ''); // /konu/abc -> konu/abc
    }
    
    const target = `${SHELL_ROOT_PATH}${search ? `?${search}` : ""}#${targetHash}`;
    window.location.replace(target);
    return true;
}

function createShellViews() {
    const dashboardContainer = document.querySelector(".dashboard-container");
    if (!dashboardContainer) return null;

    dashboardContainer.classList.add("user-shell-view");
    dashboardContainer.dataset.routeKey = "dashboard";

    const shellMain = document.createElement("div");
    shellMain.id = "userShellMain";
    shellMain.className = "user-shell-main";

    const focusAnchor = document.createElement("h1");
    focusAnchor.id = "userShellFocusAnchor";
    focusAnchor.className = "user-shell-focus-anchor";
    focusAnchor.tabIndex = -1;
    shellMain.appendChild(focusAnchor);

    const liveRegion = document.createElement("div");
    liveRegion.id = "userShellLiveRegion";
    liveRegion.className = "user-shell-live-region";
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    shellMain.appendChild(liveRegion);

    Object.values(ROUTES).forEach((route) => {
        if (route.key === "dashboard") return;
        const view = document.createElement("section");
        view.className = "user-shell-view";
        view.dataset.routeKey = route.key;
        view.hidden = true;
        shellMain.appendChild(view);
    });

    dashboardContainer.parentElement.appendChild(shellMain);
    return { shellMain, dashboardContainer, focusAnchor, liveRegion };
}

function getRouteViewElement(views, routeKey) {
    if (!views) return null;
    if (routeKey === "dashboard") return views.dashboardContainer;
    return views.shellMain.querySelector(`.user-shell-view[data-route-key="${routeKey}"]`);
}

function isDynamicTopicRouteKey(routeKey) {
    return typeof routeKey === "string" && routeKey.startsWith("konu/");
}

function resolveActiveRouteKey(routeKey) {
    if (ROUTES[routeKey]) return routeKey;
    if (isDynamicTopicRouteKey(routeKey)) return routeKey;
    return "dashboard";
}

function setExclusiveRouteVisibility(views, activeRouteKey) {
    const activeKey = resolveActiveRouteKey(activeRouteKey);
    const dashboardView = views?.dashboardContainer;
    if (dashboardView) {
        dashboardView.hidden = activeKey !== "dashboard";
    }

    views?.shellMain?.querySelectorAll(".user-shell-view[data-route-key]").forEach((view) => {
        const key = view.dataset.routeKey;
        view.hidden = key !== activeKey;
    });
}

function isRouteViewVisible(viewEl) {
    if (!viewEl) return false;
    if (viewEl.hidden) return false;
    const style = window.getComputedStyle(viewEl);
    return style.display !== "none" && style.visibility !== "hidden";
}

function setupNavInterception(navigateToRoute) {
    const clickHandler = (event) => {
        const link = event.target.closest("a");
        if (!link) return;
        if (link.target && link.target !== "_self") return;
        if (link.hasAttribute("download")) return;

        const url = new URL(link.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        const isKonuLink = url.pathname.startsWith('/konu/') && url.pathname.length > 6;
        if (url.pathname !== SHELL_ROOT_PATH && !LEGACY_PATH_TO_ROUTE[url.pathname] && !isKonuLink) return;
        if (url.searchParams.get("shell") === "1") return;

        const hashRouteKey = url.hash ? url.hash.replace(/^#/, "") : null;
        const legacyRouteKey = LEGACY_PATH_TO_ROUTE[url.pathname] || null;
        
        let targetKey = hashRouteKey && (ROUTES[hashRouteKey] || hashRouteKey.startsWith("konu/"))
            ? hashRouteKey
            : legacyRouteKey;
            
        if (isKonuLink && !hashRouteKey) {
            targetKey = url.pathname.replace(/^\//, ''); // /konu/abc -> konu/abc
        }

        if (!targetKey || (!ROUTES[targetKey] && !targetKey.startsWith("konu/"))) return;

        event.preventDefault();
        navigateToRoute(targetKey);
    };

    document.body.addEventListener("click", clickHandler);
    return () => {
        document.body.removeEventListener("click", clickHandler);
    };
}

function markActiveNav(routeKey) {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    const navRouteKey = isDynamicTopicRouteKey(routeKey) ? "konular" : routeKey;
    const route = ROUTES[navRouteKey] || ROUTES.dashboard;
    const navItem = document.querySelector(`.nav-item[data-shell-route="${route.key}"]`)
        || document.querySelector(`.nav-item[data-page="${route.pageId}"]`);
    if (navItem) navItem.classList.add("active");
}

function syncTopicScrollbarVisibility(routeKey) {
    const shouldHideScrollbar = isDynamicTopicRouteKey(routeKey);
    document.documentElement.classList.toggle(TOPIC_SCROLLBAR_CLASS, shouldHideScrollbar);
    document.body.classList.toggle(TOPIC_SCROLLBAR_CLASS, shouldHideScrollbar);
}

function scheduleIdlePrefetch(modulesByKey) {
    const prefetchList = Object.values(ROUTES)
        .filter((route) => route.prefetchPriority === "high")
        .map((route) => route.key);
    if (!prefetchList.length) return;

    const task = async () => {
        for (const key of prefetchList) {
            const module = modulesByKey.get(key);
            if (!module || typeof module.prefetch !== "function") continue;
            try {
                await module.prefetch();
            } catch (error) {
                console.warn(`Prefetch atlandı (${key})`, error);
            }
        }
    };

    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(() => { void task(); }, { timeout: 1200 });
    } else {
        window.setTimeout(() => { void task(); }, 250);
    }
}

function setupIntentPrefetch(modulesByKey, resolveRouteForPrefetch) {
    const prefetched = new Set();

    const prefetchRoute = (routeKey) => {
        if (!routeKey || prefetched.has(routeKey)) return;
        const module = typeof resolveRouteForPrefetch === "function"
            ? resolveRouteForPrefetch(routeKey)
            : modulesByKey.get(routeKey);
        if (!module || typeof module.prefetch !== "function") return;
        prefetched.add(routeKey);
        void module.prefetch().catch((error) => {
            prefetched.delete(routeKey);
            console.warn(`Intent prefetch atlandı (${routeKey})`, error);
        });
    };

    const getTopicRouteKeyFromAnchor = (anchor) => {
        if (!anchor) return null;
        const href = anchor.getAttribute("href") || "";
        if (!href || href.startsWith("#")) return null;
        try {
            const url = new URL(href, window.location.origin);
            if (url.origin !== window.location.origin) return null;
            if (!url.pathname.startsWith("/konu/") || url.pathname.length <= 6) return null;
            return url.pathname.replace(/^\//, "");
        } catch {
            return null;
        }
    };

    const handleMouseOver = (event) => {
        const navItem = event.target.closest(".nav-item[data-shell-route]");
        if (navItem) {
            prefetchRoute(navItem.dataset.shellRoute);
            return;
        }
        const topicLink = event.target.closest('a[href^="/konu/"]');
        const topicRouteKey = getTopicRouteKeyFromAnchor(topicLink);
        if (topicRouteKey) prefetchRoute(topicRouteKey);
    };

    const handleFocusIn = (event) => {
        const navItem = event.target.closest(".nav-item[data-shell-route]");
        if (navItem) {
            prefetchRoute(navItem.dataset.shellRoute);
            return;
        }
        const topicLink = event.target.closest('a[href^="/konu/"]');
        const topicRouteKey = getTopicRouteKeyFromAnchor(topicLink);
        if (topicRouteKey) prefetchRoute(topicRouteKey);
    };

    const handleTouchStart = (event) => {
        const topicLink = event.target.closest('a[href^="/konu/"]');
        const topicRouteKey = getTopicRouteKeyFromAnchor(topicLink);
        if (topicRouteKey) prefetchRoute(topicRouteKey);
    };

    document.body.addEventListener("mouseover", handleMouseOver);
    document.body.addEventListener("focusin", handleFocusIn);
    document.body.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
        document.body.removeEventListener("mouseover", handleMouseOver);
        document.body.removeEventListener("focusin", handleFocusIn);
        document.body.removeEventListener("touchstart", handleTouchStart);
    };
}

export function initUserShellRouter(siteConfig) {
    const state = resolveUserShellState(siteConfig);
    if (!state.enabled || state.isEmbed) return null;
    if (state.pathname !== SHELL_ROOT_PATH) return null;

    ensureProgressStyle();
    const views = createShellViews();
    if (!views) return null;

    const progress = createProgressBar();
    const modulesByKey = new Map();
    const dashboardModule = new DashboardModule(ROUTES.dashboard, views.dashboardContainer);
    modulesByKey.set("dashboard", dashboardModule);

    const loadNativeModuleFactory = (routeKey) => {
        switch (routeKey) {
            case "analiz":
                return import("./modules/user/analysis-shell.js").then((mod) => mod.createAnalysisShellModule);
            case "konular":
                return import("./modules/user/konular-shell.js").then((mod) => mod.createKonularShellModule);
            case "denemeler":
                return import("./modules/user/denemeler-shell.js").then((mod) => mod.createDenemelerShellModule);
            case "favoriler":
                return import("./modules/user/favoriler-shell.js").then((mod) => mod.createFavorilerShellModule);
            case "yanlislarim":
                return import("./modules/user/yanlislarim-shell.js").then((mod) => mod.createYanlislarimShellModule);
            case "profil":
                return import("./modules/user/profile-shell.js").then((mod) => mod.createProfileShellModule);
            default:
                return null;
        }
    };

    Object.values(ROUTES).forEach((route) => {
        if (route.key === "dashboard") return;
        const viewEl = views.shellMain.querySelector(`.user-shell-view[data-route-key="${route.key}"]`);
        if (route.moduleKind === "native") {
            const nativeFactoryPromise = loadNativeModuleFactory(route.key);
            if (nativeFactoryPromise) {
                modulesByKey.set(route.key, new NativeModule(route, viewEl, async ({ route: rt, viewEl: el }) => {
                    const nativeFactory = await nativeFactoryPromise;
                    return nativeFactory({ route: rt, viewEl: el });
                }));
                return;
            }
        }
        modulesByKey.set(route.key, new IframeModule(route, viewEl));
    });

    let currentRouteKey = null;
    let transitionPromise = Promise.resolve();
    const frameByWindow = new WeakMap();

    const focusRouteAnchor = (route) => {
        const routeView = route.key === "dashboard"
            ? views.dashboardContainer
            : views.shellMain.querySelector(`.user-shell-view[data-route-key="${route.key}"]`);
        const target = route.focusTarget && routeView
            ? routeView.querySelector(route.focusTarget)
            : null;
        if (target && typeof target.focus === "function") {
            if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
            target.focus({ preventScroll: true });
            return;
        }

        if (!views.focusAnchor) return;
        views.focusAnchor.textContent = route.focusLabel;
        views.focusAnchor.focus({ preventScroll: true });
    };

    const announceRouteForA11y = (route) => {
        if (!views.liveRegion) return;
        views.liveRegion.textContent = `${route.focusLabel} sayfası açıldı`;
    };

    const fallbackToLegacyPage = (route, error) => {
        console.error(`User shell route fallback (${route.key})`, error);
        if (analytics) {
            try {
                logEvent(analytics, "user_shell_transition_error", {
                    route_key: route.key,
                    fallback_path: route.legacyPath
                });
            } catch {
                // noop
            }
        }

        const params = new URLSearchParams(window.location.search);
        params.delete("shellV2");
        const search = params.toString();
        const fallbackUrl = `${route.legacyPath}${search ? `?${search}` : ""}`;
        window.location.assign(fallbackUrl);
    };

    const getOrCreateDynamicRoute = (routeKey) => {
        if (ROUTES[routeKey]) return ROUTES[routeKey];
        if (routeKey.startsWith("konu/")) {
            return {
                key: routeKey,
                hash: `#${routeKey}`,
                legacyPath: `/${routeKey}`,
                title: "Konu Detayı | GOLD GYS",
                focusLabel: "Konu İçeriği",
                moduleKind: "iframe",
                prefetchPriority: "low",
                scrollPolicy: "reset"
            };
        }
        return null;
    };

    const ensureDynamicTopicModule = (routeKey) => {
        if (!isDynamicTopicRouteKey(routeKey)) return modulesByKey.get(routeKey) || null;
        if (modulesByKey.has(routeKey)) return modulesByKey.get(routeKey);
        const route = getOrCreateDynamicRoute(routeKey);
        if (!route || route.moduleKind !== "iframe") return null;

        const viewEl = document.createElement("section");
        viewEl.className = "user-shell-view";
        viewEl.dataset.routeKey = route.key;
        viewEl.hidden = true;
        views.shellMain.appendChild(viewEl);

        const iframeModule = new IframeModule(route, viewEl);
        modulesByKey.set(route.key, iframeModule);

        const originalLoadIfNeeded = iframeModule.loadIfNeeded.bind(iframeModule);
        iframeModule.loadIfNeeded = async () => {
            await originalLoadIfNeeded();
            if (iframeModule.iframe?.contentWindow) {
                frameByWindow.set(iframeModule.iframe.contentWindow, iframeModule.iframe);
            }
        };

        return iframeModule;
    };

    const navigateToRoute = (nextRouteKey, options = {}) => {
        transitionPromise = transitionPromise.then(async () => {
            const transitionStartedAt = performance.now();
            const route = getOrCreateDynamicRoute(nextRouteKey) || ROUTES.dashboard;
            const previousRouteKey = currentRouteKey;
            const previousModule = previousRouteKey ? modulesByKey.get(previousRouteKey) : null;
            
            // Dinamik route için modül henüz oluşturulmadıysa oluştur ve DOM'a ekle
            const nextModule = isDynamicTopicRouteKey(route.key)
                ? ensureDynamicTopicModule(route.key)
                : modulesByKey.get(route.key);
            if (!nextModule) return;
            const transitionType = nextModule.initialized ? "warm" : "cold";

            if (previousRouteKey && ROUTES[previousRouteKey]?.scrollPolicy === "restore") {
                saveScroll(previousRouteKey);
            }

            progress.start();
            try {
                if (previousModule && previousRouteKey !== route.key) {
                    await previousModule.deactivate();
                }
                try {
                    await nextModule.activate();
                } catch (activationError) {
                    fallbackToLegacyPage(route, activationError);
                    return;
                }
                setExclusiveRouteVisibility(views, route.key);
                const activeView = getRouteViewElement(views, route.key);
                if (!isRouteViewVisible(activeView)) {
                    throw new Error(`Route görünür değil: ${route.key}`);
                }
                currentRouteKey = route.key;
                document.title = route.title;
                markActiveNav(route.key);
                syncTopicScrollbarVisibility(route.key);
                try {
                    window.dispatchEvent(new CustomEvent("user-shell:route-changed", {
                        detail: {
                            routeKey: route.key,
                            previousRouteKey
                        }
                    }));
                } catch {
                    // noop
                }
                focusRouteAnchor(route);
                announceRouteForA11y(route);
                trackPageView(route);
                const transitionMs = Math.round(performance.now() - transitionStartedAt);
                const transitionStats = updateTransitionMetrics(transitionMs, transitionType);
                if (analytics) {
                    try {
                        logEvent(analytics, "user_shell_transition", {
                            route_key: route.key,
                            transition_ms: transitionMs,
                            transition_type: transitionType,
                            p95_ms_all: transitionStats.p95All,
                            p95_ms_warm: transitionStats.p95Warm,
                            p95_ms_cold: transitionStats.p95Cold
                        });
                    } catch {
                        // noop
                    }
                }
                if (ROUTES[route.key]?.scrollPolicy === "restore") {
                    restoreScroll(route.key);
                } else if (!options.preserveScroll) {
                    window.scrollTo({ top: 0, behavior: "auto" });
                }
            } finally {
                progress.stop();
            }
        }).catch((error) => {
            const route = getOrCreateDynamicRoute(nextRouteKey) || ROUTES.dashboard;
            fallbackToLegacyPage(route, error);
        });
        return transitionPromise;
    };

    const handleFrameMessage = (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || typeof data.type !== "string") return;

        if (data.type === "user-shell:navigate") {
            const routeKey = String(data.routeKey || "").trim();
            if (!routeKey) return;
            if (!ROUTES[routeKey] && !isDynamicTopicRouteKey(routeKey)) return;
            setHashForRoute(routeKey);
            return;
        }

        if (data.type !== "user-shell:height") return;
        const iframe = frameByWindow.get(event.source);
        if (!iframe) return;
        const nextHeight = Number(data.height || 0);
        if (!Number.isFinite(nextHeight) || nextHeight < 300) return;
        iframe.style.height = `${Math.ceil(nextHeight)}px`;
    };
    window.addEventListener("message", handleFrameMessage);

    const handleHashChange = () => {
        const routeKey = getRouteFromHash();
        void navigateToRoute(routeKey, { preserveScroll: true });
    };
    window.addEventListener("hashchange", handleHashChange);

    const removeNavInterception = setupNavInterception((routeKey) => {
        setHashForRoute(routeKey);
    });
    const removeIntentPrefetch = setupIntentPrefetch(modulesByKey, (routeKey) => {
        if (isDynamicTopicRouteKey(routeKey)) {
            return ensureDynamicTopicModule(routeKey);
        }
        return modulesByKey.get(routeKey) || null;
    });

    // iframe referansları hazır oldukça yükseklik eşlemesi için kaydet
    modulesByKey.forEach((module) => {
        if (!(module instanceof IframeModule)) return;
        const originalLoadIfNeeded = module.loadIfNeeded.bind(module);
        module.loadIfNeeded = async () => {
            await originalLoadIfNeeded();
            if (module.iframe?.contentWindow) {
                frameByWindow.set(module.iframe.contentWindow, module.iframe);
            }
        };
    });

    const initialRoute = getRouteFromHash();
    setExclusiveRouteVisibility(views, initialRoute);
    setHashForRoute(initialRoute, { replace: !window.location.hash });
    void navigateToRoute(initialRoute, { preserveScroll: true });
    scheduleIdlePrefetch(modulesByKey);

    const getTransitionMetrics = () => {
        const metrics = readTransitionMetrics();
        return {
            p95All: calculateP95(metrics.all),
            p95Warm: calculateP95(metrics.warm),
            p95Cold: calculateP95(metrics.cold),
            countAll: metrics.all.length,
            countWarm: metrics.warm.length,
            countCold: metrics.cold.length
        };
    };

    window.__userShellMetrics = {
        getTransitionMetrics
    };

    return {
        navigate: (routeKey, options) => navigateToRoute(routeKey, options),
        getCurrentRoute: () => currentRouteKey,
        getTransitionMetrics,
        dispose: async () => {
            window.removeEventListener("message", handleFrameMessage);
            window.removeEventListener("hashchange", handleHashChange);
            if (typeof removeNavInterception === "function") removeNavInterception();
            if (typeof removeIntentPrefetch === "function") removeIntentPrefetch();
            document.documentElement.classList.remove(TOPIC_SCROLLBAR_CLASS);
            document.body.classList.remove(TOPIC_SCROLLBAR_CLASS);
            for (const module of modulesByKey.values()) {
                await module.dispose();
            }
            delete window.__userShellMetrics;
        }
    };
}
