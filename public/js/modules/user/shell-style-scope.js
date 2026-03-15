/* --- CSS Fetch Cache --- */
const _cssCache = new Map();

/**
 * Fetch CSS text with in-memory caching.
 * Avoids duplicate network requests when multiple shell modules
 * load the same stylesheet (e.g. dashboard-route-overrides.css).
 */
export async function fetchCss(url) {
    if (_cssCache.has(url)) return _cssCache.get(url);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`CSS fetch failed: ${resp.status} ${url}`);
    const text = await resp.text();
    _cssCache.set(url, text);
    return text;
}

const STYLE_RULE_TYPE = 1;
const MEDIA_RULE_TYPE = 4;
const FONT_FACE_RULE_TYPE = 5;
const SUPPORTS_RULE_TYPE = 12;
const KEYFRAMES_RULE_TYPE = 7;

const BLOCKED_DECLARATIONS = new Set([
    "visibility",
    "overflow",
    "overflow-x",
    "overflow-y"
]);

const GLOBAL_SELECTOR_RE = /^(:root|html|body)$/i;
const GLOBAL_SELECTOR_PREFIX_RE = /^(html|body|:root)\b/i;
const THEME_SELECTOR_PREFIX_RE = /^((?:html|body)?\s*\[data-theme[^\]]*\])/i;

export function injectScopedStyle({ styleId, cssText, scopeSelector }) {
    if (!styleId || !cssText || !scopeSelector) return;
    if (document.getElementById(styleId)) return;

    const scopedCss = scopeCss(cssText, scopeSelector);
    if (!scopedCss.trim()) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = scopedCss;
    document.head.appendChild(style);
}

export function removeScopedStyle(styleId) {
    if (!styleId) return;
    const style = document.getElementById(styleId);
    if (style) style.remove();
}

function scopeCss(cssText, scopeSelector) {
    if (typeof cssText !== "string" || !cssText.trim()) return "";

    const parserNode = document.createElement("style");
    // CSS kurallari parse edilsin ama dokumana uygulanmasin.
    parserNode.media = "not all";
    parserNode.textContent = cssText;
    document.head.appendChild(parserNode);

    let scoped = "";
    try {
        const rules = parserNode.sheet?.cssRules;
        if (rules && rules.length) {
            scoped = serializeRules(rules, scopeSelector);
        }
    } catch {
        // CSSOM parse edilemeyen bir parca varsa guvenli fallback.
        scoped = fallbackScope(cssText, scopeSelector);
    } finally {
        parserNode.remove();
    }
    return scoped;
}

function serializeRules(rules, scopeSelector) {
    let output = "";
    for (const rule of Array.from(rules || [])) {
        if (!rule) continue;

        if (rule.type === STYLE_RULE_TYPE) {
            const scopedRule = serializeStyleRule(rule, scopeSelector);
            if (scopedRule) output += `${scopedRule}\n`;
            continue;
        }

        if (rule.type === MEDIA_RULE_TYPE) {
            const inner = serializeRules(rule.cssRules, scopeSelector);
            if (inner.trim()) output += `@media ${rule.conditionText}{\n${inner}}\n`;
            continue;
        }

        if (rule.type === SUPPORTS_RULE_TYPE) {
            const inner = serializeRules(rule.cssRules, scopeSelector);
            if (inner.trim()) output += `@supports ${rule.conditionText}{\n${inner}}\n`;
            continue;
        }

        if (rule.type === FONT_FACE_RULE_TYPE || rule.type === KEYFRAMES_RULE_TYPE) {
            output += `${rule.cssText}\n`;
        }
    }
    return output;
}

function serializeStyleRule(rule, scopeSelector) {
    const selectors = rule.selectorText
        .split(",")
        .map((part) => scopeSelectorPart(part.trim(), scopeSelector))
        .filter(Boolean);
    if (!selectors.length) return "";

    const onlyGlobal = selectors.every((selector) => selector === scopeSelector);
    const declarationText = sanitizeDeclarations(rule.style, onlyGlobal);
    if (!declarationText) return "";
    return `${selectors.join(", ")} { ${declarationText} }`;
}

function sanitizeDeclarations(styleDecl, dropBlocked) {
    const declarations = [];
    for (const prop of Array.from(styleDecl || [])) {
        const normalizedProp = String(prop || "").trim().toLowerCase();
        if (!normalizedProp) continue;
        if (dropBlocked && BLOCKED_DECLARATIONS.has(normalizedProp)) continue;
        const value = styleDecl.getPropertyValue(prop);
        const priority = styleDecl.getPropertyPriority(prop);
        declarations.push(`${prop}: ${value}${priority ? ` !${priority}` : ""};`);
    }
    return declarations.join(" ");
}

function scopeSelectorPart(selector, scopeSelector) {
    if (!selector) return null;
    if (selector.startsWith(scopeSelector)) return selector;
    // Keep html/body data-theme root selectors valid after scoping.
    if (THEME_SELECTOR_PREFIX_RE.test(selector)) {
        return selector.replace(THEME_SELECTOR_PREFIX_RE, `$1 ${scopeSelector}`);
    }
    if (GLOBAL_SELECTOR_RE.test(selector)) return scopeSelector;
    if (GLOBAL_SELECTOR_PREFIX_RE.test(selector)) {
        return selector.replace(GLOBAL_SELECTOR_PREFIX_RE, scopeSelector);
    }
    return `${scopeSelector} ${selector}`;
}

function fallbackScope(cssText, scopeSelector) {
    const stripped = String(cssText || "").replace(/\/\*[\s\S]*?\*\//g, "");
    const ruleRegex = /(^|})\s*([^@{}][^{}]*)\{([^{}]*)\}/g;
    return stripped.replace(ruleRegex, (match, boundary, selectorGroup, body) => {
        const selectors = selectorGroup
            .split(",")
            .map((part) => scopeSelectorPart(part.trim(), scopeSelector))
            .filter(Boolean);
        if (!selectors.length) return "";
        return `${boundary} ${selectors.join(", ")} { ${String(body || "").trim()} }`;
    });
}
