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
    const logoUrl = config?.branding?.logoUrl;

    // Update Title if default
    if (siteName && document.title.includes("GOLD GYS")) {
        document.title = document.title.replace("GOLD GYS", siteName);
    }

    const brandElements = document.querySelectorAll("[data-site-setting='site-name'], .brand-logo");
    brandElements.forEach((el) => {
        // If we have a logo URL and the element is purely for branding, consider replacing with Image or updating text
        // For now, let's keep text but update it. If user wants image replacement, we'd need more specific logic.
        // However, if the element is an IMG tag, update src.
        if (el.tagName === 'IMG' && logoUrl) {
            el.src = logoUrl;
            if (siteName) el.alt = siteName;
        } else if (siteName) {
            // Preserve span structure if possible, otherwise simple text replacement
            if (siteName === "Gold GYS" && el.innerHTML.includes("<span>")) return;
            el.textContent = siteName;
        }
    });

    // Logo Image specific targets
    if (logoUrl) {
        document.querySelectorAll("[data-site-setting='site-logo']").forEach(img => {
            if (img.tagName === 'IMG') img.src = logoUrl;
        });
    }

    // Slogan rendering
    const slogan = config?.branding?.slogan;
    if (slogan) {
        document.querySelectorAll("[data-site-setting='slogan'], .hero-desc").forEach(el => {
            if (el.hasAttribute('data-site-setting')) el.textContent = slogan;
        });
    }
}

function applySeo(config) {
    const defaultTitle = config?.seo?.defaultTitle?.trim();
    const defaultDescription = config?.seo?.defaultDescription?.trim();
    const defaultKeywords = config?.seo?.defaultKeywords;
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

    if (defaultKeywords) {
        const keywordsContent = Array.isArray(defaultKeywords) ? defaultKeywords.join(", ") : defaultKeywords;
        upsertMetaByName("keywords", keywordsContent);
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
    const supportPhone = config?.contact?.supportPhone?.trim();
    const whatsappUrl = config?.contact?.whatsappUrl?.trim();
    const telegramUrl = config?.contact?.telegramUrl?.trim();

    // Helper to update and show/hide elements
    const updateLink = (selector, value, type) => {
        document.querySelectorAll(selector).forEach((el) => {
            if (value) {
                el.style.display = ""; // Reset display (show)
                if (el.tagName === "A") {
                    if (type === "email") el.setAttribute("href", `mailto:${value}`);
                    else if (type === "phone") el.setAttribute("href", `tel:${value.replace(/\s+/g, '')}`);
                    else el.setAttribute("href", value);
                }
                // Don't overwrite text if it has nested children (like icons) unless it's a specific data-target
                // But for "quick buttons" we often want to keep the icon and just change href.
                // If the element is meant to display text (like a phone number span), it should be targeted differently or check content.
                // For now, let's ONLY update text if the element has 'data-update-text' attribute or is NOT a quick button with icon.
                if (el.hasAttribute('data-update-text')) {
                    el.textContent = value;
                }
            } else {
                el.style.display = "none"; // Hide if no value
            }
        });
    };

    updateLink("[data-site-setting='support-email']", supportEmail, "email");
    updateLink("[data-site-setting='support-phone']", supportPhone, "phone");
    updateLink("[data-site-setting='whatsapp-url']", whatsappUrl, "url");
    updateLink("[data-site-setting='telegram-url']", telegramUrl, "url");
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
