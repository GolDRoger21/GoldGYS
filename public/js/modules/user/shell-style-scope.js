export function injectScopedStyle({ styleId, cssText, scopeSelector }) {
    if (!styleId || !cssText || !scopeSelector) return;
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = scopeCss(cssText, scopeSelector);
    document.head.appendChild(style);
}

function scopeCss(cssText, scopeSelector) {
    if (typeof cssText !== "string" || !cssText.trim()) return "";

    const ruleRegex = /(^|})\s*([^@{}][^{}]*)\{/g;
    return cssText.replace(ruleRegex, (match, boundary, selectorGroup) => {
        const trimmedGroup = selectorGroup.trim();
        if (!trimmedGroup) return match;
        if (isKeyframeStepSelectorGroup(trimmedGroup)) {
            return `${boundary} ${trimmedGroup}{`;
        }

        const scopedSelectors = trimmedGroup
            .split(",")
            .map((selector) => scopeSelectorPart(selector.trim(), scopeSelector))
            .join(", ");

        return `${boundary} ${scopedSelectors}{`;
    });
}

function isKeyframeStepSelectorGroup(group) {
    return group
        .split(",")
        .map((part) => part.trim())
        .every((part) => /^(from|to|\d+%)$/i.test(part));
}

function scopeSelectorPart(selector, scopeSelector) {
    if (!selector) return scopeSelector;
    if (selector.startsWith(scopeSelector)) return selector;
    if (selector === ":root" || selector === "html" || selector === "body") {
        return scopeSelector;
    }
    if (/^(html|body)\b/i.test(selector)) {
        return selector.replace(/^(html|body)\b/i, scopeSelector);
    }
    if (/^:root\b/i.test(selector)) {
        return selector.replace(/^:root\b/i, scopeSelector);
    }
    return `${scopeSelector} ${selector}`;
}
