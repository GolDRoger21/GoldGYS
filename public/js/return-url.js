const LEGACY_TO_HASH = Object.freeze({
    "/dashboard": "/dashboard#dashboard",
    "/konular": "/dashboard#konular",
    "/denemeler": "/dashboard#denemeler",
    "/yanlislarim": "/dashboard#yanlislarim",
    "/favoriler": "/dashboard#favoriler",
    "/analiz": "/dashboard#analiz",
    "/profil": "/dashboard#profil"
});

function isUserShellEnabled() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shellV2") === "0") return false;
    if (params.get("shellV2") === "1") return true;
    return localStorage.getItem("userShellV2") === "1";
}

export function getSafeReturnUrl(rawValue, fallback) {
    if (!rawValue) return fallback;
    try {
        const resolved = new URL(rawValue, window.location.origin);
        if (resolved.origin !== window.location.origin) return fallback;
        return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
        return fallback;
    }
}

export function normalizeReturnUrlForShell(rawReturnUrl, fallback = "/dashboard#dashboard") {
    const safeUrl = getSafeReturnUrl(rawReturnUrl, fallback);
    if (!safeUrl) return fallback;
    if (!isUserShellEnabled()) return safeUrl;

    try {
        const resolved = new URL(safeUrl, window.location.origin);
        if (resolved.pathname === "/dashboard") {
            if (!resolved.hash) return "/dashboard#dashboard";
            return `${resolved.pathname}${resolved.search}${resolved.hash}`;
        }

        if (LEGACY_TO_HASH[resolved.pathname]) {
            return LEGACY_TO_HASH[resolved.pathname];
        }

        return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    } catch {
        return safeUrl;
    }
}
