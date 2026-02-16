import { applySiteConfigToDocument } from "./site-config.js";

function getThemeToggleMarkup() {
    return `
        <button id="themeToggle" class="btn-theme-toggle" aria-label="Tema Değiştir">
            <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
            <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
        </button>
    `;
}

function renderHeader(container) {
    if (!container) return;

    container.innerHTML = `
        <nav class="landing-nav">
            <div class="header-inner">
                <a href="/" class="brand-logo" data-site-setting="site-name">GOLD <span>GYS</span></a>
                <div class="header-actions-group">
                    ${getThemeToggleMarkup()}
                    <div class="auth-buttons-desktop">
                        <a href="/login.html?mode=login" class="btn btn-secondary btn-sm">Giriş Yap</a>
                        <a href="/login.html?mode=register" class="btn btn-primary btn-sm">Kayıt Ol</a>
                    </div>
                </div>
            </div>
        </nav>
    `;
}

function renderFooter(container) {
    if (!container) return;

    container.innerHTML = `
        <footer class="landing-footer">
            <div class="header-inner" style="justify-content: center; height: auto; padding: 1.25rem 0;">
                <div class="copyright-text"
                    style="text-align: center; width: 100%; color: var(--text-muted); font-size: 0.85rem;"
                    data-site-setting="footer-text">
                    &copy; ${new Date().getFullYear()} GOLD GYS. Tüm Hakları Saklıdır.
                </div>
            </div>
        </footer>
    `;
}

function bindThemeToggle() {
    const themeToggle = document.getElementById("themeToggle");
    if (!themeToggle) return;

    const htmlElement = document.documentElement;

    const updateThemeIcon = (theme) => {
        const sunIcon = document.querySelector("#themeToggle .icon-sun");
        const moonIcon = document.querySelector("#themeToggle .icon-moon");
        if (!sunIcon || !moonIcon) return;

        if (theme === "dark") {
            sunIcon.style.display = "block";
            moonIcon.style.display = "none";
            return;
        }

        sunIcon.style.display = "none";
        moonIcon.style.display = "block";
    };

    const initialTheme = htmlElement.getAttribute("data-theme") || localStorage.getItem("theme") || "light";
    htmlElement.setAttribute("data-theme", initialTheme);
    updateThemeIcon(initialTheme);

    themeToggle.addEventListener("click", () => {
        const currentTheme = htmlElement.getAttribute("data-theme");
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        htmlElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("theme", nextTheme);
        updateThemeIcon(nextTheme);
    });
}

export async function initLegalPageShell() {
    renderHeader(document.getElementById("legalHeaderPlaceholder"));
    renderFooter(document.getElementById("legalFooterPlaceholder"));
    bindThemeToggle();

    await applySiteConfigToDocument();
}
