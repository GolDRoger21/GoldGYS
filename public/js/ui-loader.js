import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getUserProfile } from './user-profile.js';

// Sayfa yollarına karşılık gelen başlık ve menü ID'lerini tanımlayan harita
const PAGE_CONFIG = {
    '/pages/dashboard.html': { id: 'dashboard', title: 'Genel Bakış' },
    '/admin/index.html': { id: 'admin', title: 'Yönetim Paneli' },
    '/pages/profil.html': { id: 'profile', title: 'Profilim' },
    '/pages/konular.html': { id: 'lessons', title: 'Dersler & Konular' },
    '/pages/testler.html': { id: 'tests', title: 'Testler' },
    '/pages/denemeler.html': { id: 'trials', title: 'Denemeler' },
    // Diğer sayfaları buraya ekleyebilirsiniz
};

// DOM Elemanları için merkezi nesne
const dom = {};

let layoutInitPromise = null;

/**
 * Arayüzü başlatan ana fonksiyon.
 * Sayfa bilgisini URL'den otomatik olarak alacak.
 */
export async function initLayout() {
    if (layoutInitPromise) return layoutInitPromise;

    layoutInitPromise = (async () => {
        // URL'i al ve uygun konfigürasyonu bul
        const path = window.location.pathname;
        const config = PAGE_CONFIG[path] || { id: 'unknown', title: 'Sayfa' };

        try {
            await loadRequiredHTML();
            cacheDomElements();

            if (dom.pageTitle) dom.pageTitle.textContent = config.title;
            setActiveMenuItem(config.id);

            // Auth durumunu kontrol et ve UI'ı güncelle
            await checkUserAuthState();
            setupEventListeners();
            
            // Her şey yüklendikten sonra sayfayı görünür yap
            document.body.style.visibility = 'visible';
            console.log(`Arayüz '${config.id}' sayfası için başarıyla yüklendi.`);

            return true;
        } catch (error) {
            console.error('KRİTİK HATA: Arayüz başlatılamadı.', error);
            // Hata durumunda bile içeriği göstermeye çalış, sonsuz yüklemede kalmasın
            document.body.style.visibility = 'visible';
            document.body.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; margin: 20px; border-radius: 5px;">
                    <h3>Arayüz Yüklenemedi</h3>
                    <p>Lütfen sayfayı yenileyin. Hata: ${error.message}</p>
                </div>
            `;
            throw error;
        }
    })();

    return layoutInitPromise;
}

async function loadRequiredHTML() {
    const isAdminPage = window.location.pathname.startsWith('/admin') || window.location.pathname.includes('/admin/');
    
    // Header seçimi
    const headerUrl = isAdminPage ? '/components/layouts/admin-header.html' : '/components/header.html';
    
    // DÜZELTME BURADA: Admin sayfasındaysak admin-sidebar.html, değilse normal sidebar.html yükle
    const sidebarUrl = isAdminPage ? '/partials/admin-sidebar.html' : '/partials/sidebar.html';
    
    // Hedef elemanları belirle
    const headerTargetId = document.getElementById('main-content') ? 'main-content' : 'header-area';
    const headerPosition = headerTargetId === 'main-content' ? 'prepend' : 'innerHTML';
    const sidebarTargetId = document.getElementById('sidebar') ? 'sidebar' : 'sidebar-area';

    const partsToLoad = [
        { url: headerUrl, targetId: headerTargetId, position: headerPosition },
        { url: sidebarUrl, targetId: sidebarTargetId, position: 'innerHTML' }
    ];

    await Promise.all(partsToLoad.map(part => loadHTML(part.url, part.targetId, part.position)));
}

async function loadHTML(url, targetId, position) {
    const target = document.getElementById(targetId);
    if (!target) {
        console.warn(`Uyarı: Hedef eleman #${targetId} bulunamadı, ${url} yüklenemedi.`);
        return; // Kritik hata fırlatmak yerine logla ve devam et (sayfanın geri kalanı çalışsın)
    }
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} - ${url} yüklenemedi.`);
        const html = await response.text();
        if (position === 'innerHTML') target.innerHTML = html;
        else target.insertAdjacentHTML('afterbegin', html);
    } catch (e) {
        console.error(`${url} yüklenirken hata:`, e);
        throw e;
    }
}

function cacheDomElements() {
    const ids = [
        // Header ve Genel UI Elementleri
        'pageTitle', 'userMenuToggle', 'profileDropdown', 'logoutButton', 
        'sidebar', 'sidebarOverlay', 'closeSidebar', 'mobileMenuToggle',
        
        // Sidebar Profil Elementleri (Varsa)
        'userNameLabel', 'userRoleLabel', 
        
        // Header Avatar Elementleri (header.html ile uyumlu)
        'userAvatarCircle', 'userAvatarImage', 'userAvatarInitial',
        
        // Dropdown Profil Elementleri (header.html ile uyumlu)
        'dropdownUserName', 'dropdownUserEmail', 'dropdownAvatarCircle', 'dropdownAvatarImage', 'dropdownAvatarInitial'
    ];
    
    ids.forEach(id => dom[id] = document.getElementById(id));
    dom.sidebarLogoutBtn = document.querySelector('.sidebar .btn-logout');
}

function setupEventListeners() {
    document.body.addEventListener('click', e => {
        const target = e.target;
        
        // Profil Menüsü Toggle
        if (target.closest('#userMenuToggle')) {
            e.stopPropagation();
            dom.profileDropdown?.classList.toggle('active');
        }
        // Profil Menüsü Dışına Tıklama
        else if (dom.profileDropdown?.classList.contains('active') && !target.closest('#profileDropdown')) {
            dom.profileDropdown.classList.remove('active');
        }
        // Mobil Menü ve Sidebar Toggle
        else if (target.closest('#mobileMenuToggle') || target.closest('#closeSidebar') || target.closest('#sidebarOverlay')) {
            dom.sidebar?.classList.toggle('active');
            dom.sidebarOverlay?.classList.toggle('active');
        }
        // Çıkış İşlemleri (Hem header hem sidebar hem dropdown)
        else if (target.closest('#logoutButton') || target.closest('.btn-logout')) {
            handleLogout();
        }
    });
}

async function checkUserAuthState() {
    return new Promise((resolve, reject) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const profile = await getUserProfile(user.uid);
                    const tokenResult = await user.getIdTokenResult();
                    const claims = tokenResult?.claims || {};
                    // Admin/Editor yetkisini claim veya profilden al
                    const resolvedRole = profile?.role || (claims.admin ? 'admin' : claims.editor ? 'editor' : 'student');
                    
                    updateUIAfterLogin(user, { ...(profile || {}), role: resolvedRole });
                    checkUserRole(resolvedRole);
                    resolve();
                } catch (error) {
                    console.error("Oturum profili hatası:", error);
                    // Profil yüklenemese bile kullanıcı adını göster
                    updateUIAfterLogin(user, { role: 'student' });
                    checkUserRole('student');
                    resolve(); // Hata olsa bile resolve et ki sayfa açılsın
                }
            } else {
                // Giriş yapmamış kullanıcıyı yönlendir
                const isPublicPage = window.location.pathname.includes('/login.html') || window.location.pathname === '/';
                if (!isPublicPage) {
                    window.location.href = '/login.html';
                }
                resolve();
            }
        });
    });
}

function updateUIAfterLogin(user, profile) {
    const name = (profile.ad && profile.soyad) ? `${profile.ad} ${profile.soyad}` : (user.displayName || "Kullanıcı");
    const email = user.email || "";
    const roleName = translateRole(profile.role);
    const photoURL = profile.photoURL || user.photoURL;
    const initial = name.charAt(0).toUpperCase();

    // 1. Sidebar (Varsa) Güncelle
    if(dom.userNameLabel) dom.userNameLabel.textContent = name;
    if(dom.userRoleLabel) dom.userRoleLabel.textContent = roleName;

    // 2. Header Avatar Güncelle
    setAvatar(dom.userAvatarCircle, dom.userAvatarImage, dom.userAvatarInitial, photoURL, initial);

    // 3. Dropdown Menü Güncelle
    if(dom.dropdownUserName) dom.dropdownUserName.textContent = name;
    if(dom.dropdownUserEmail) dom.dropdownUserEmail.textContent = email;
    setAvatar(dom.dropdownAvatarCircle, dom.dropdownAvatarImage, dom.dropdownAvatarInitial, photoURL, initial);
}

function setAvatar(circle, image, initialEl, photoURL, initial) {
    if (!circle || !image || !initialEl) return;
    
    if (photoURL) {
        circle.classList.add('has-photo');
        image.src = photoURL;
        image.style.display = 'block';
        if(initialEl) initialEl.style.display = 'none';
    } else {
        circle.classList.remove('has-photo');
        image.style.display = 'none';
        if(initialEl) {
            initialEl.style.display = 'flex'; // 'block' yerine 'flex' daha iyi ortalar
            initialEl.textContent = initial;
        }
    }
}

function checkUserRole(role) {
    const adminElements = document.querySelectorAll('.admin-only');
    const shouldBeVisible = (role === 'admin' || role === 'editor');
    adminElements.forEach(el => {
        el.style.display = shouldBeVisible ? '' : 'none'; // 'flex' veya 'block' yerine boş bırakmak orijinal display'i korur
    });
}

function setActiveMenuItem(activePageId) {
    if (!dom.sidebar || !activePageId) return;
    
    // Önceki aktifleri temizle
    dom.sidebar.querySelectorAll('.active').forEach(item => item.classList.remove('active'));
    
    // Yeni aktifi seç (Hem 'a' hem 'li' desteği)
    const activeItem = dom.sidebar.querySelector(`[data-page="${activePageId}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        // Eğer bir submenu içindeyse parent'ı da açabiliriz (opsiyonel)
    }
}

async function handleLogout() {
    if (confirm("Çıkış yapmak istiyor musunuz?")) {
        try {
            await signOut(auth);
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Çıkış hatası:', error);
            alert("Çıkış yapılırken bir hata oluştu.");
        }
    }
}

function translateRole(role) {
    const roles = { admin: 'Yönetici', editor: 'Editör', student: 'Öğrenci' };
    return roles[role] || 'Kullanıcı';
}

// --- OTOMATİK BAŞLATMA ---
document.addEventListener('DOMContentLoaded', initLayout);
