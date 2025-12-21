import { auth } from "./firebase-config.js";
import { ensureUserDocument } from "./user-profile.js";

const FALLBACK_HTML = {
    sidebar: `
        <div class="sidebar-logo">
            <a href="/pages/dashboard.html" class="brand-mark brand-on-dark brand-compact" aria-label="Gold GYS paneline dön">
                <span class="brand-highlight">GOLD</span>GYS ⚖️
            </a>
        </div>
        <nav class="sidebar-menu sidebar-nav">
            <ul>
                <li><a href="/pages/dashboard.html" data-page="dashboard"><span class="icon">📊</span> Panelim</a></li>
                <li><a href="/pages/konular.html" data-page="konular"><span class="icon">📚</span> Ders Notları</a></li>
                <li><a href="/pages/testler.html" data-page="testler"><span class="icon">📝</span> Konu Testleri</a></li>
                <li><a href="/pages/denemeler.html" data-page="denemeler"><span class="icon">🏆</span> Denemeler</a></li>
                <li><a href="/pages/yanlislarim.html" data-page="yanlislarim"><span class="icon">⚠️</span> Yanlışlarım</a></li>
                <li class="editor-only" style="display:none; margin-top:20px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;">
                    <a href="/pages/konular.html" data-page="editor"><span class="icon">✍️</span> Editör Araçları</a>
                </li>
                <li class="admin-only" style="display:none;"><a href="/pages/admin.html" data-page="admin"><span class="icon">⚙️</span> Yönetici Paneli</a></li>
            </ul>
        </nav>
        <div class="sidebar-footer">
            <button id="btnLogout" onclick="window.handleLogout()">
                <span class="icon">🚪</span> Çıkış Yap
            </button>
        </div>
    `,
    header: `
        <div class="header-inner">
            <div class="header-left">
                <button class="mobile-menu-toggle" onclick="toggleSidebar()" aria-label="Yan menüyü aç/kapat">☰</button>
                <a href="/pages/dashboard.html" class="brand-mark header-brand" aria-label="Gold GYS panel ana sayfası">
                    <span class="brand-highlight">GOLD</span>GYS
                </a>
                <span id="pageTitle" class="page-title">Panelim</span>
            </div>
            <div class="header-right">
                <nav class="main-nav" aria-label="Ana navigasyon">
                    <a href="/pages/dashboard.html" data-page="dashboard">Panel</a>
                    <a href="/pages/testler.html" data-page="testler">Testler</a>
                    <a href="/pages/denemeler.html" data-page="denemeler">Denemeler</a>
                </nav>
                <div class="user-menu" data-profile-menu>
                    <div class="user-profile">
                        <div class="user-avatar" id="headerUserInitial">👤</div>
                        <div class="user-meta">
                            <span class="user-name" id="headerUserName">Yükleniyor...</span>
                            <span class="user-subtitle">Aktif</span>
                        </div>
                    </div>
                    <button class="profile-toggle" type="button" aria-haspopup="true" aria-expanded="false" data-profile-toggle>▾</button>
                    <div class="profile-dropdown" id="profileDropdown">
                        <a href="/pages/profil.html">👤 Profilim</a>
                        <button class="logout-btn" type="button" onclick="window.handleLogout()">🚪 Çıkış Yap</button>
                    </div>
                </div>
            </div>
        </div>
    `,
};

async function loadComponent(elementId, filePath, fallbackKey, afterLoad) {
    const element = document.getElementById(elementId);
    if (!element) return;

    let html = null;

    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        html = await response.text();
    } catch (error) {
        console.error("Component yüklenemedi:", filePath, error);
        if (fallbackKey && FALLBACK_HTML[fallbackKey]) {
            html = FALLBACK_HTML[fallbackKey];
        }
    }

    if (html) {
        element.innerHTML = html;
        if (typeof afterLoad === "function") afterLoad(element);
    }
}

export async function initLayout(pageKey, options = {}) {
    const { requireAuth = true } = options;
    // 1. Sidebar ve Header'ı Yükle
    await Promise.all([
        loadComponent('sidebar-area', '/partials/sidebar.html', 'sidebar'),
        loadComponent('header-area', '/partials/header.html', 'header', (headerEl) => {
            const titleAttr = document.body?.dataset?.pageTitle;
            if (titleAttr) {
                const pageTitleEl = headerEl.querySelector('#pageTitle');
                if (pageTitleEl) pageTitleEl.innerText = titleAttr;
            }
        })
    ]);

    // 2. Aktif Menüyü İşaretle
    if (pageKey) {
        document.querySelectorAll(`.sidebar-nav a[data-page="${pageKey}"], .sidebar-menu a[data-page="${pageKey}"]`)
            .forEach(link => link.classList.add('active'));
        document.querySelectorAll(`.main-nav a[data-page="${pageKey}"]`)
            .forEach(link => link.classList.add('active'));
    }

    // 3. Kullanıcı Bilgisini Getir (Firebase Auth)
    // Yeni HTML yapısına göre ID'leri seçiyoruz
    const userNameEl = document.getElementById('headerUserName');
    const userEmailEl = document.getElementById('headerUserEmail');
    const userInitialEl = document.getElementById('headerUserInitial');
    const dropdownInitialEl = document.getElementById('dropdownUserInitial');

    auth.onAuthStateChanged(async user => {
        if (user) {
            // İsim yerine "..." koyarak başla
            if (userNameEl) userNameEl.innerText = 'Kullanıcı';
            
            const profile = await ensureUserDocument(user);
            
            // İsim Belirleme
            let displayName = 'Kullanıcı';
            if (profile && (profile.name || profile.ad)) {
                displayName = `${profile.name || profile.ad} ${profile.surname || profile.soyad || ''}`.trim();
            } else if (user.displayName) {
                displayName = user.displayName;
            } else if (user.email) {
                displayName = user.email.split('@')[0];
            }

            // Baş harf
            const initial = displayName.charAt(0).toUpperCase();

            // HTML'e yerleştirme
            if (userNameEl) userNameEl.innerText = displayName;
            if (userEmailEl) userEmailEl.innerText = user.email || '';
            if (userInitialEl) userInitialEl.innerText = initial;
            if (dropdownInitialEl) dropdownInitialEl.innerText = initial;

            // Admin kontrolü (Mevcut kodunuzu koruyoruz)
            try {
                const idTokenResult = await user.getIdTokenResult();
                const roleFromClaims = idTokenResult.claims.role;
                const roleSet = new Set([
                    roleFromClaims,
                    ...(Array.isArray(profile?.roles) ? profile.roles : []),
                    profile?.role,
                    idTokenResult.claims.admin ? 'admin' : null,
                ].filter(Boolean));

                const hasAdminRole = roleSet.has('admin');
                const hasEditorRole = roleSet.has('editor') || hasAdminRole;

                if (hasAdminRole) {
                    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
                }

                if (hasEditorRole) {
                    document.querySelectorAll('.editor-only').forEach(el => el.style.display = 'block');
                }
            } catch (error) {
                console.error('Admin yetki hatası:', error);
            }

        } else if (!user && requireAuth) {
            window.location.href = '/login.html';
        }
    });

    // 4. Profil menüsü etkileşimleri (Google Style Toggle)
    const profileToggle = document.querySelector('[data-profile-toggle]');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileMenuContainer = document.querySelector('[data-profile-menu]');

    if (profileToggle && profileDropdown && profileMenuContainer) {
        // Tıklama olayı
        profileToggle.addEventListener('click', (event) => {
            event.stopPropagation();
            const isOpen = profileDropdown.classList.contains('open');
            
            if (isOpen) {
                profileDropdown.classList.remove('open');
                profileToggle.setAttribute('aria-expanded', 'false');
            } else {
                profileDropdown.classList.add('open');
                profileToggle.setAttribute('aria-expanded', 'true');
            }
        });

        // Dışarı tıklayınca kapat
        document.addEventListener('click', (event) => {
            if (!profileMenuContainer.contains(event.target)) {
                profileDropdown.classList.remove('open');
                profileToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }
}

// Global Fonksiyonlar (HTML onclick için)
window.toggleSidebar = () => {
    const sidebar = document.querySelector('.app-sidebar');
    if (!sidebar) return;

    const isOpen = sidebar.classList.toggle('open');
    document.body.classList.toggle('sidebar-open', isOpen);
};

window.handleLogout = () => {
    auth.signOut().then(() => window.location.href = '/login.html');
};
