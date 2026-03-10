import { analytics } from "./firebase-config.js";
import { logEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const SHELL_ROOT_PATH = "/dashboard";
const SCROLL_STORAGE_KEY = "user_shell_scroll_v1";
const PROGRESS_STYLE_ID = "user-shell-progress-style";

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
        pageId: "lessons",
        moduleKind: "iframe",
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
        pageId: "mistakes",
        moduleKind: "iframe",
        prefetchPriority: "low",
        scrollPolicy: "restore"
    },
    favoriler: {
        key: "favoriler",
        hash: "#favoriler",
        legacyPath: "/favoriler",
        title: "Favoriler | GOLD GYS",
        focusLabel: "Favoriler",
        pageId: "favorites",
        moduleKind: "iframe",
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
    return ROUTES[hash] ? hash : "dashboard";
}

function setHashForRoute(routeKey, options = {}) {
    const route = ROUTES[routeKey] || ROUTES.dashboard;
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
        min-height: 60vh;
      }
      .user-shell-view {
        width: 100%;
      }
      .user-shell-view[hidden] {
        display: none !important;
      }
      .user-shell-frame {
        width: 100%;
        border: 0;
        min-height: 76vh;
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

function resolveShouldEnableUserShell(siteConfig) {
    const params = getQueryParams();
    const forceDisable = params.get("shellV2") === "0";
    if (forceDisable) return false;

    const forceEnable = params.get("shellV2") === "1" || localStorage.getItem("userShellV2") === "1";
    if (forceEnable) return true;

    return siteConfig?.features?.userShellV2 === true;
}

export function shouldSkipEmbeddedChrome() {
    return isShellEmbedMode();
}

export function getLegacyRouteKey(pathname = getPathname()) {
    return LEGACY_PATH_TO_ROUTE[pathname] || null;
}

export function resolveUserShellState(siteConfig) {
    return {
        enabled: resolveShouldEnableUserShell(siteConfig),
        isEmbed: isShellEmbedMode(),
        pathname: getPathname(),
        legacyRouteKey: getLegacyRouteKey()
    };
}

export function maybeRedirectLegacyPathToShell(siteConfig) {
    const state = resolveUserShellState(siteConfig);
    if (!state.enabled || state.isEmbed) return false;
    if (!state.legacyRouteKey) return false;
    if (state.pathname === SHELL_ROOT_PATH) return false;

    const params = new URLSearchParams(window.location.search);
    params.delete("shell");
    const search = params.toString();
    const target = `${SHELL_ROOT_PATH}${search ? `?${search}` : ""}#${state.legacyRouteKey}`;
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

function setupNavInterception(navigateToRoute) {
    const clickHandler = (event) => {
        const link = event.target.closest("a");
        if (!link) return;
        if (link.target && link.target !== "_self") return;
        if (link.hasAttribute("download")) return;

        const url = new URL(link.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        if (url.pathname !== SHELL_ROOT_PATH && !LEGACY_PATH_TO_ROUTE[url.pathname]) return;
        if (url.searchParams.get("shell") === "1") return;

        const targetKey = LEGACY_PATH_TO_ROUTE[url.pathname] || (url.hash ? url.hash.replace(/^#/, "") : null);
        if (!targetKey || !ROUTES[targetKey]) return;

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
    const route = ROUTES[routeKey] || ROUTES.dashboard;
    const navItem = document.querySelector(`.nav-item[data-shell-route="${route.key}"]`)
        || document.querySelector(`.nav-item[data-page="${route.pageId}"]`);
    if (navItem) navItem.classList.add("active");
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

function setupIntentPrefetch(modulesByKey) {
    const prefetched = new Set();

    const prefetchRoute = (routeKey) => {
        if (!routeKey || prefetched.has(routeKey)) return;
        const module = modulesByKey.get(routeKey);
        if (!module || typeof module.prefetch !== "function") return;
        prefetched.add(routeKey);
        void module.prefetch().catch((error) => {
            prefetched.delete(routeKey);
            console.warn(`Intent prefetch atlandı (${routeKey})`, error);
        });
    };

    const handleMouseOver = (event) => {
        const navItem = event.target.closest(".nav-item[data-shell-route]");
        if (!navItem) return;
        prefetchRoute(navItem.dataset.shellRoute);
    };

    const handleFocusIn = (event) => {
        const navItem = event.target.closest(".nav-item[data-shell-route]");
        if (!navItem) return;
        prefetchRoute(navItem.dataset.shellRoute);
    };

    document.body.addEventListener("mouseover", handleMouseOver);
    document.body.addEventListener("focusin", handleFocusIn);

    return () => {
        document.body.removeEventListener("mouseover", handleMouseOver);
        document.body.removeEventListener("focusin", handleFocusIn);
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
            case "denemeler":
                return import("./modules/user/denemeler-shell.js").then((mod) => mod.createDenemelerShellModule);
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

    const navigateToRoute = (nextRouteKey, options = {}) => {
        transitionPromise = transitionPromise.then(async () => {
            const transitionStartedAt = performance.now();
            const route = ROUTES[nextRouteKey] || ROUTES.dashboard;
            const previousRouteKey = currentRouteKey;
            const previousModule = previousRouteKey ? modulesByKey.get(previousRouteKey) : null;
            const nextModule = modulesByKey.get(route.key);
            if (!nextModule) return;

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
                currentRouteKey = route.key;
                document.title = route.title;
                markActiveNav(route.key);
                focusRouteAnchor(route);
                announceRouteForA11y(route);
                trackPageView(route);
                const transitionMs = Math.round(performance.now() - transitionStartedAt);
                if (analytics) {
                    try {
                        logEvent(analytics, "user_shell_transition", {
                            route_key: route.key,
                            transition_ms: transitionMs
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
        });
        return transitionPromise;
    };

    const handleFrameMessage = (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.type !== "user-shell:height") return;
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
    const removeIntentPrefetch = setupIntentPrefetch(modulesByKey);

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
    setHashForRoute(initialRoute, { replace: !window.location.hash });
    void navigateToRoute(initialRoute, { preserveScroll: true });
    scheduleIdlePrefetch(modulesByKey);

    return {
        navigate: (routeKey, options) => navigateToRoute(routeKey, options),
        getCurrentRoute: () => currentRouteKey,
        dispose: async () => {
            window.removeEventListener("message", handleFrameMessage);
            window.removeEventListener("hashchange", handleHashChange);
            if (typeof removeNavInterception === "function") removeNavInterception();
            if (typeof removeIntentPrefetch === "function") removeIntentPrefetch();
            for (const module of modulesByKey.values()) {
                await module.dispose();
            }
        }
    };
}
