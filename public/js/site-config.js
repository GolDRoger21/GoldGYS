import { db } from "./firebase-config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { DEFAULT_PUBLIC_CONFIG, mergeWithDefaultPublicConfig } from "./config-defaults.js";

let configCache = null;

export async function loadSiteConfig(options = {}) {
    const { force = false } = options;

    if (!force && configCache) return configCache;

    try {
        const snap = await getDoc(doc(db, "config", "public"));
        configCache = mergeWithDefaultPublicConfig(snap.exists() ? snap.data() : {});
        return configCache;
    } catch (error) {
        console.warn("Site config okunamadı:", error);
        return mergeWithDefaultPublicConfig();
    }
}

export async function applySiteConfigToDocument() {
    const config = await loadSiteConfig();
    applyBranding(config);
    applySeo(config);
    applyFooter(config);
    applyLegalLinks(config);
    applySupportLinks(config);
    return config;
}

export function applyTicketCategoriesToSelect(selectEl, categories) {
    if (!selectEl) return;

    const fallback = DEFAULT_PUBLIC_CONFIG.contact.ticketCategories;

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
        // CASE 1: It's already an IMG tag (e.g. in some templates)
        if (el.tagName === 'IMG') {
            if (logoUrl) {
                el.src = logoUrl;
                el.style.display = '';
                if (siteName) el.alt = siteName;
            } else {
                // If no logo URL, hide the IMG element (or show placeholder if desired, but hiding is safer for "Text Mode")
                el.style.display = 'none';
            }
            return;
        }

        // CASE 2: It's a container (A, SPAN, H1, DIV)
        // We want to show Image if logoUrl exists, otherwise Text.

        if (logoUrl) {
            // Check if we already injected an image
            let img = el.querySelector('img.dynamic-logo');
            if (!img) {
                // Clear text and add image
                el.textContent = '';
                img = document.createElement('img');
                img.className = 'dynamic-logo';
                img.style.maxHeight = '40px'; // Reasonable default, CSS can override
                img.style.verticalAlign = 'middle';
                el.appendChild(img);
            }
            img.src = logoUrl;
            img.alt = siteName || "Logo";
        } else {
            // Restore Text Mode
            // Check if we have an image to remove
            const img = el.querySelector('img.dynamic-logo');
            if (img) img.remove();

            // Set text content if it's not "Gold GYS" with usage of spans (preserving existing complex HTML if generic)
            // But user specifically wants to toggle.
            // If the element is empty or has our dynamic logo, set the text.
            if (siteName) {
                el.textContent = siteName;
            }
        }
    });

    // Slogan rendering
    const slogan = config?.branding?.slogan;
    if (slogan) {
        document.querySelectorAll("[data-site-setting='slogan'], .hero-desc").forEach(el => {
            // Only update if it's meant to be dynamic, avoiding accidental overwrite of structural elements
            // Simple check: if it has the data attribute or is a known class
            el.textContent = slogan;
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

    const footerTargets = document.querySelectorAll("[data-site-setting='footer-text'], .footer-copy, .copyright, .landing-footer .copyright-text");
    footerTargets.forEach((el) => {
        if (el.children.length === 0 || el.querySelector('br')) {
            el.textContent = footerText.replace("{year}", new Date().getFullYear());
        }
    });
}

function applyLegalLinks(config) {
    const legal = config?.legal || {};
    const showMembershipAgreementSeparately = legal.showMembershipAgreementSeparately !== false;

    const links = [
        { label: "Açık Rıza Metni", href: legal.acikRizaUrl },
        { label: "Aydınlatma Metni", href: legal.aydinlatmaMetniUrl },
        { label: "Gizlilik Sözleşmesi", href: legal.gizlilikSozlesmesiUrl },
        { label: "Kullanım Şartları", href: legal.kullanimSartlariUrl }
    ];

    if (showMembershipAgreementSeparately) {
        links.push({ label: "Üyelik Sözleşmesi", href: legal.uyelikSozlesmesiUrl });
    }

    const list = document.querySelector("[data-site-setting='legal-links']");
    if (!list) return;

    list.innerHTML = links
        .filter((item) => !!item.href)
        .map(({ label, href }) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`)
        .join("");
}

function applySupportLinks(config) {
    // Falls back to defaults if config is missing (Transient fix until they save settings)
    const supportEmail = config?.contact?.supportEmail?.trim() || "";
    const supportPhone = config?.contact?.supportPhone?.trim() || "";

    // Default Gold GYS links if not configured
    const whatsappUrl = config?.contact?.whatsappUrl?.trim() || "https://wa.me/905432194953";
    const telegramUrl = config?.contact?.telegramUrl?.trim() || "https://t.me/goldgys";

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
