
/**
 * Router.js
 * Centralized Single Page Application (SPA) Router
 * Handles navigation, history state, and page lifecycle management.
 */

import { MaintenanceGuard } from './maintenance-guard.js';

export class Router {
    constructor(config) {
        this.routes = config.routes || {};
        this.aliases = config.aliases || {};
        this.baseTitle = config.baseTitle || 'Gold GYS';
        this.notFoundRoute = config.notFoundRoute || '/404';

        // State
        this.currentPath = null;
        this.currentParams = {};
        this.isNavigating = false;
        this.abortController = null;
        this.currentCleanup = null;
        this.isInitialized = false;

        // Bindings
        this.handleLinkClick = this.handleLinkClick.bind(this);
        this.handlePopState = this.handlePopState.bind(this);
    }

    /**
     * Initialize the router
     */
    init() {
        if (this.isInitialized) {
            console.warn('Router already initialized.');
            return;
        }
        console.log('Router initializing...');

        // Event Listeners
        window.addEventListener('popstate', this.handlePopState);
        document.body.addEventListener('click', this.handleLinkClick);

        this.isInitialized = true;

        // Initial Load
        const path = window.location.pathname + window.location.search;
        // Replace current state directly to ensure history state is valid
        window.history.replaceState({ path }, document.title, path);

        return this.navigate(path, { replace: true, isInitial: true });
    }

    /**
     * Destroy the router and remove listeners
     */
    destroy() {
        window.removeEventListener('popstate', this.handlePopState);
        document.body.removeEventListener('click', this.handleLinkClick);
        this.isInitialized = false;
        if (this.abortController) {
            this.abortController.abort();
        }
    }

    /**
     * Handle back/forward browser buttons
     */
    async handlePopState(event) {
        const path = window.location.pathname + window.location.search;
        console.log(`[Router] PopState detected: ${path}`);
        await this.navigate(path, { push: false });
    }

    /**
     * Intercept link clicks for SPA navigation
     */
    handleLinkClick(e) {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        // Ignore non-navigation links
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

        // Ignore external links or new tab targets
        if (link.target === '_blank' || link.hasAttribute('download')) return;

        // Check if same origin
        const url = new URL(link.href, window.location.origin);
        if (url.origin !== window.location.origin) return;

        // Ignore explicitly opted-out links
        if (link.classList.contains('no-spa')) return;

        // Prevent default and navigate
        e.preventDefault();
        const path = url.pathname + url.search;
        this.navigate(path);
    }

    /**
     * Normalize path (remove trailing slash, etc)
     */
    normalizePath(path) {
        const cleanPath = path.split('?')[0];
        if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
            return cleanPath.slice(0, -1);
        }
        return cleanPath;
    }

    /**
     * Resolve configuration for a given path
     */
    resolve(path) {
        const normalized = this.normalizePath(path);

        // 1. Direct Match
        if (this.routes[normalized]) {
            return { ...this.routes[normalized], path };
        }

        // 2. Alias Match
        if (this.aliases[normalized]) {
            if (this.routes[this.aliases[normalized]]) {
                return { ...this.routes[this.aliases[normalized]], path };
            }
            // Direct alias config support (if aliases has full config)
            if (typeof this.aliases[normalized] === 'object') {
                return { ...this.aliases[normalized], path };
            }
        }

        // 3. Dynamic Routes (Simple segment matching)
        const segments = normalized.split('/').filter(Boolean);
        if (segments.length > 1) {
            const basePath = `/${segments[0]}`;
            if (this.routes[basePath]) {
                return { ...this.routes[basePath], path };
            }
        }

        return null; // Not found
    }

    /**
     * Core Navigation Method
     */
    async navigate(path, options = {}) {
        const { push = true, replace = false, isInitial = false } = options;

        // 1. Resolve Route
        const routeConfig = this.resolve(path);
        if (!routeConfig) {
            console.warn(`[Router] Route not found: ${path}`);
            if (path !== this.notFoundRoute) {
                return this.navigate(this.notFoundRoute, { replace: true });
            }
            return;
        }

        // 2. Block redundant navigation (same path)
        // Allow if it's initial load or explicitly forced (maybe later)
        if (!isInitial && path === this.currentPath) {
            console.log('[Router] Same path navigation blocked');
            return;
        }

        console.log(`[Router] Navigating to ${path}`, routeConfig);

        // 3. Guards (Maintenance)
        try {
            await MaintenanceGuard.check();
        } catch (e) {
            return;
        }

        // 4. Update History
        if (push) {
            window.history.pushState({ path }, routeConfig.title || this.baseTitle, path);
        } else if (replace) {
            window.history.replaceState({ path }, routeConfig.title || this.baseTitle, path);
        }

        // 5. Abort previous navigation/requests
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        this.isNavigating = true;
        this.currentPath = path;

        // 6. UI Loading State
        this.emit('start', { path });

        try {
            // 7. Cleanup Old Page
            if (this.currentCleanup) {
                console.log('[Router] Cleaning up previous page...');
                try {
                    await this.currentCleanup();
                } catch (e) {
                    console.error('[Router] Cleanup error:', e);
                }
                this.currentCleanup = null;
            }

            // 8. Load New Page Content & Script
            if (this.onNavigate) {
                // Pass signal to onNavigate
                const result = await this.onNavigate(routeConfig, path, signal);

                if (signal.aborted) {
                    console.log('[Router] Navigation aborted explicitly during onNavigate');
                    return;
                }

                if (result && result.cleanup) {
                    this.currentCleanup = result.cleanup;
                }
            }

            // 9. Update Document Title
            document.title = `${routeConfig.title} | ${this.baseTitle}`;

            // 10. Finalize
            this.emit('end', { path });

        } catch (error) {
            if (error.name === 'AbortError' || signal.aborted) {
                console.log('[Router] Navigation aborted.');
            } else {
                console.error('[Router] Navigation failed:', error);
                this.emit('error', { error, path });
            }
        } finally {
            if (!signal.aborted) {
                this.isNavigating = false;
            }
        }
    }

    /**
     * Simple Event Emitter interface
     */
    listeners = {};
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}
