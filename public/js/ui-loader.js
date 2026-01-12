import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getUserProfile } from './user-profile.js';

// DOM Elementlerini topluca yönetmek için bir nesne
const dom = {};

/**
 * Sayfa düzenini (layout) oluşturan ana fonksiyon.
 * @param {string} activePageId - Kenar çubuğunda aktif olarak işaretlenecek sayfanın ID'si (data-page attribute'u).
 * @param {string} pageTitle - Sayfa başlığını ayarlamak için metin.
 */
export async function initLayout(activePageId, pageTitle = 'Genel Bakış') {
    try {
        await Promise.all([
            loadHTML('/partials/sidebar.html', 'mainWrapper', 'prepend'),
            loadHTML('/partials/app-header.html', 'main-content', 'prepend')
        ]);

        // DOM elementlerini cache'le
        cacheDomElements();

        // Sayfa başlığını ayarla
        if (dom.pageTitle) {
            dom.pageTitle.textContent = pageTitle;
        }

        // Aktif menü öğesini işaretle
        setActiveMenuItem(activePageId);

        // Tüm event listener'ları kur
        setupEventListeners();

        // Kullanıcı durumunu dinle ve UI'ı güncelle
        await checkUserAuthState();

        return true;
    } catch (error) {
        console.error('Layout yüklenirken kritik bir hata oluştu:', error);
        // Kullanıcıya bir hata mesajı göstermek için opsiyonel bir UI eklemesi yapılabilir.
        return false;
    }
}

/**
 * Verilen HTML parçasını belirtilen hedefe yükler.
 * @param {string} url - Yüklenecek HTML dosyasının yolu.
 * @param {string} targetId - HTML'in ekleneceği elementin ID'si.
 * @param {string} position - Ekleme pozisyonu ('prepend', 'append', 'innerHTML').
 */
async function loadHTML(url, targetId, position = 'append') {
    const target = document.getElementById(targetId);
    if (!target) throw new Error(`${targetId} ID'li element bulunamadı.`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} yüklenemedi. Status: ${response.status}`);
    
    const html = await response.text();
    
    if (position === 'innerHTML') {
        target.innerHTML = html;
    } else if (position === 'prepend') {
        target.insertAdjacentHTML('afterbegin', html);
    } else {
        target.insertAdjacentHTML('beforeend', html);
    }
}

/**
 * Sık kullanılan DOM elementlerini 'dom' nesnesine atar.
 */
function cacheDomElements() {
    Object.assign(dom, {
        sidebar: document.getElementById('sidebar'),
        appHeader: document.querySelector('.app-header'),
        pageTitle: document.getElementById('pageTitle'),
        mobileMenuToggle: document.getElementById('mobileMenuToggle'),
        sidebarOverlay: document.getElementById('sidebarOverlay'),
        closeSidebarBtn: document.getElementById('closeSidebar'),
        userMenuToggle: document.getElementById('userMenuToggle'),
        profileDropdown: document.getElementById('profileDropdown'),
        logoutButton: document.getElementById('logoutButton'), // Dropdown içindeki
        sidebarLogoutBtn: document.getElementById('logoutBtn') // Sidebar içindeki
    });
}

/**
 * Kenar çubuğunda aktif menü öğesini ayarlar.
 * @param {string} activePageId 
 */
function setActiveMenuItem(activePageId) {
    if (!dom.sidebar) return;
    const navItems = dom.sidebar.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
        if (item.dataset.page === activePageId) {
            item.classList.add('active');
        }
    });
}

/**
 * Tüm interaktif elementler için olay dinleyicilerini kurar.
 */
function setupEventListeners() {
    // Mobil menü toggle
    if (dom.mobileMenuToggle && dom.sidebar && dom.sidebarOverlay) {
        dom.mobileMenuToggle.onclick = toggleMobileMenu;
        dom.closeSidebarBtn.onclick = toggleMobileMenu;
        dom.sidebarOverlay.onclick = toggleMobileMenu;
    }

    // Kullanıcı profil menüsü toggle
    if (dom.userMenuToggle && dom.profileDropdown) {
        dom.userMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dom.profileDropdown.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!dom.userMenuToggle.contains(e.target)) {
                dom.profileDropdown.classList.remove('active');
            }
        });
    }

    // Çıkış butonları
    const handleLogout = async () => {
        if (confirm("Çıkış yapmak istediğinize emin misiniz?")) {
            try {
                await signOut(auth);
                window.location.href = '/login.html';
            } catch (error) {
                console.error('Çıkış yapılamadı:', error);
            }
        }
    };
    if (dom.logoutButton) dom.logoutButton.onclick = handleLogout;
    if (dom.sidebarLogoutBtn) dom.sidebarLogoutBtn.onclick = handleLogout;
}

/**
 * Mobil menüyü açıp kapatır.
 */
function toggleMobileMenu() {
    dom.sidebar.classList.toggle('active');
    dom.sidebarOverlay.classList.toggle('active');
}

/**
 * Firebase Auth durumunu kontrol eder ve UI'ı günceller.
 */
async function checkUserAuthState() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Oturum açılmış, kullanıcı profilini getir
            const profile = await getUserProfile(user.uid);
            if (profile) {
                updateUIAfterLogin(user, profile);
                checkUserRole(profile.role);
            }
        } else {
            // Oturum açılmamış, login sayfasına yönlendir (eğer zaten orada değilse)
            if (!window.location.pathname.includes('/login.html')) {
                window.location.href = '/login.html';
            }
        }
    });
}

/**
 * Kullanıcı bilgileriyle UI elementlerini günceller.
 * @param {object} user - Firebase Auth kullanıcı nesnesi.
 * @param {object} profile - Firestore'dan gelen kullanıcı profili.
 */
function updateUIAfterLogin(user, profile) {
    const displayName = profile.ad ? `${profile.ad} ${profile.soyad}`.trim() : user.displayName;
    const photoURL = profile.photoURL || user.photoURL;
    const initial = (displayName || '?').charAt(0).toUpperCase();

    // Header'daki elementler
    updateElement('userNameLabel', displayName);
    updateElement('userRoleLabel', translateRole(profile.role));
    updateAvatar('userAvatar', photoURL, initial);

    // Dropdown'daki elementler
    updateElement('dropdownUserName', displayName);
    updateElement('dropdownUserEmail', user.email);
    updateAvatar('dropdownAvatar', photoURL, initial);
}

/**
 * Avatar elementlerini (resim veya baş harf) günceller.
 */
function updateAvatar(baseId, photoURL, initial) {
    const circle = document.getElementById(`${baseId}Circle`);
    const image = document.getElementById(`${baseId}Image`);
    const initialEl = document.getElementById(`${baseId}Initial`);

    if (!circle || !image || !initialEl) return;

    if (photoURL) {
        circle.classList.add('has-photo');
        image.src = photoURL;
    } else {
        circle.classList.remove('has-photo');
        initialEl.textContent = initial;
    }
}

/**
 * Bir elementin içeriğini güvenli bir şekilde günceller.
 */
function updateElement(id, content) {
    const el = document.getElementById(id);
    if (el && content) el.textContent = content;
}

/**
 * Kullanıcı rolünü kontrol eder ve yönetici menüsünü gösterir.
 * @param {string} role 
 */
function checkUserRole(role) {
    if (role === 'admin' || role === 'editor') {
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => {
            // Stili doğrudan değiştirerek !important kuralını eziyoruz
            if (el.tagName === 'A' || el.classList.contains('nav-item')) {
                el.style.display = 'flex';
            } else {
                el.style.display = 'block';
            }
        });
    }
}

/**
 * Rol ismini Türkçeye çevirir.
 */
function translateRole(role) {
    switch (role) {
        case 'admin': return 'Yönetici';
        case 'editor': return 'Editör';
        default: return 'Öğrenci';
    }
}
