import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let configCache = null;

export async function loadSiteConfig(options = {}) {
    const { force = false } = options;

    if (!force && configCache) return configCache;

    try {
        const snap = await getDoc(doc(db, "config", "public"));
        configCache = snap.exists() ? snap.data() : {};
        return configCache;
    } catch (error) {
        console.warn("Site config okunamadı:", error);
        return {};
    }
}

export async function applySiteConfigToDocument() {
    const config = await loadSiteConfig();
    applyBranding(config);
    applySeo(config);
    applyFooter(config);
    applySupportLinks(config);
    return config;
}

export function applyTicketCategoriesToSelect(selectEl, categories) {
    if (!selectEl) return;

    const fallback = [
        { value: "Genel", label: "Genel Bilgi Talebi" },
        { value: "Teknik", label: "Teknik Sorun / Hata" },
        { value: "İçerik", label: "Soru / İçerik Hatası" },
        { value: "Ödeme", label: "Üyelik ve Erişim" },
        { value: "Öneri", label: "Öneri ve Geri Bildirim" }
    ];

    const normalized = Array.isArray(categories)
        ? categories
            .map((item) => {
                if (typeof item === "string") {
                    const text = item.trim();
                    return text ? { value: text, label: text } : null;
                }
                if (item && typeof item === "object") {
                    const value = String(item.value || item.label || "").trim();
                    const label = String(item.label || item.value || "").trim();
                    if (!value || !label) return null;
                    return { value, label };
                }
                return null;
            })
            .filter(Boolean)
        : [];

    const options = normalized.length ? normalized : fallback;
    selectEl.innerHTML = options
        .map(({ value, label }) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
        .join("");
}

function applyBranding(config) {
    const siteName = config?.branding?.siteName;
    if (!siteName) return;

    // Update Title if default
    if (document.title.includes("GOLD GYS")) {
        document.title = document.title.replace("GOLD GYS", siteName);
    }

    const brandElements = document.querySelectorAll("[data-site-setting='site-name'], .brand-logo");
    brandElements.forEach((el) => {
        // Preserve span structure if possible, otherwise simple text replacement
        if (siteName === "Gold GYS" && el.innerHTML.includes("<span>")) return; // Keep default styling
        el.textContent = siteName;
    });

    // Slogan rendering
    const slogan = config?.branding?.slogan;
    if (slogan) {
        document.querySelectorAll("[data-site-setting='slogan'], .hero-desc").forEach(el => {
            // Only replace if it's explicitly marked or we decide to overwrite hero-desc
            if (el.hasAttribute('data-site-setting')) el.textContent = slogan;
        });
    }
}

function applySeo(config) {
    const defaultTitle = config?.seo?.defaultTitle?.trim();
    const defaultDescription = config?.seo?.defaultDescription?.trim();
    const ogImageUrl = config?.seo?.ogImageUrl?.trim();
    const faviconUrl = config?.branding?.faviconUrl?.trim();

    if (defaultTitle && window.location.pathname === "/") {
        document.title = defaultTitle;
    }

    if (defaultDescription) {
        upsertMetaByName("description", defaultDescription);
        upsertMetaByProperty("og:description", defaultDescription);
        upsertMetaByProperty("twitter:description", defaultDescription);
    }

    if (defaultTitle) {
        upsertMetaByProperty("og:title", defaultTitle);
        upsertMetaByProperty("twitter:title", defaultTitle);
    }

    if (ogImageUrl) {
        upsertMetaByProperty("og:image", ogImageUrl);
        upsertMetaByProperty("twitter:image", ogImageUrl);
    }

    if (faviconUrl) {
        let link = document.querySelector("link[rel='icon']");
        if (!link) {
            link = document.createElement("link");
            link.setAttribute("rel", "icon");
            document.head.appendChild(link);
        }
        link.setAttribute("href", faviconUrl);
    }
}

function applyFooter(config) {
    const footerText = config?.branding?.footerText?.trim();
    if (!footerText) return;

    // Selectors: data attribute, specific classes, or footer text containers
    const footerTargets = document.querySelectorAll("[data-site-setting='footer-text'], .footer-copy, .copyright, .landing-footer .copyright-text");
    footerTargets.forEach((el) => {
        // If it's a direct text node container
        if (el.children.length === 0 || el.querySelector('br')) {
            el.textContent = footerText.replace("{year}", new Date().getFullYear());
        }
    });
}

function applySupportLinks(config) {
    const supportEmail = config?.contact?.supportEmail?.trim();
    const whatsappUrl = config?.contact?.whatsappUrl?.trim();
    const telegramUrl = config?.contact?.telegramUrl?.trim();

    if (supportEmail) {
        document.querySelectorAll("[data-site-setting='support-email']").forEach((el) => {
            if (el.tagName === "A") {
                el.setAttribute("href", `mailto:${supportEmail}`);
            }
            el.textContent = supportEmail;
        });
    }

    if (whatsappUrl) {
        document.querySelectorAll("[data-site-setting='whatsapp-url']").forEach((el) => {
            if (el.tagName === "A") {
                el.setAttribute("href", whatsappUrl);
            }
        });
    }

    if (telegramUrl) {
        document.querySelectorAll("[data-site-setting='telegram-url']").forEach((el) => {
            if (el.tagName === "A") {
                el.setAttribute("href", telegramUrl);
            }
        });
    }
}

function upsertMetaByName(name, content) {
    let meta = document.querySelector(`meta[name='${name}']`);
    if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", name);
        document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);
}

function upsertMetaByProperty(property, content) {
    let meta = document.querySelector(`meta[property='${property}']`);
    if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("property", property);
        document.head.appendChild(meta);
    }
    meta.setAttribute("content", content);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
