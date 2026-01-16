import { initLayout } from './ui-loader.js';
// Not: Diğer modülleri (dashboard, content vb.) en başta import etmiyoruz.
// Onları aşağıda, ihtiyaç duyulduğu an çağıracağız (Dynamic Import).

// Yüklenen modülleri hafızada tutmak için (Cache)
const loadedModules = {
    dashboard: false,
    content: false,
    users: false,
    reports: false,
    questions: false,
    exams: false
};

/**
 * 1. SAYFA BAŞLANGICI
 */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // A. Arayüzü Yükle (Header & Sidebar)
        await initLayout();
        console.log("✅ Admin Arayüzü (Layout) Yüklendi.");

        // B. Rota İşlemini Başlat
        handleRouting();

        // C. Hash Değişimlerini Dinle (Linke tıklanınca)
        window.addEventListener('hashchange', handleRouting);

    } catch (e) {
        console.error("❌ Admin Başlatma Hatası:", e);
        document.body.innerHTML = `<div style="color:red; padding:20px; text-align:center;">Admin paneli yüklenirken hata oluştu.<br>${e.message}</div>`;
    }
});

/**
 * 2. ROTA YÖNETİCİSİ (ROUTER)
 * URL'deki #hash değerine göre doğru sayfayı açar.
 */
async function handleRouting() {
    // Varsayılan sayfa: dashboard
    const hash = window.location.hash || '#dashboard';
    const pageId = hash.replace('#', ''); // 'content', 'users' vb.
    
    console.log(`🔄 Rota değişti: ${pageId}`);

    // A. Tüm Admin Bölümlerini Gizle
    document.querySelectorAll('.admin-section').forEach(el => {
        el.style.display = 'none';
    });

    // B. Sidebar Linkini Aktif Yap
    highlightSidebar(hash);

    // C. Hedef Bölümü Bul
    const targetSection = document.getElementById(`section-${pageId}`);
    
    if (targetSection) {
        targetSection.style.display = 'block';

        // --- ÖZEL MOD: TAM EKRAN (CONTENT MANAGER) ---
        if (pageId === 'content') {
            document.body.classList.add('content-mode'); // CSS'deki padding sıfırlamayı tetikler
        } else {
            document.body.classList.remove('content-mode'); // Normale dön
        }

        // D. Modülü Yükle ve Başlat (Lazy Load)
        await loadModule(pageId, targetSection);

    } else {
        // Bilinmeyen bir sayfa ise Dashboard'a at
        console.warn(`⚠️ Bölüm bulunamadı: ${pageId}, Dashboard'a yönlendiriliyor.`);
        window.location.hash = '#dashboard';
    }
}

/**
 * 3. DİNAMİK MODÜL YÜKLEYİCİ
 * Modül JS dosyasını sadece ihtiyaç olduğunda indirir ve çalıştırır.
 */
async function loadModule(moduleId, container) {
    // Eğer modül zaten yüklendiyse tekrar yükleme (Performans)
    if (loadedModules[moduleId]) {
        return; 
    }

    // Yükleniyor animasyonu (Eğer içerik boşsa)
    if (container.innerHTML.trim() === '') {
        container.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 text-muted" style="min-height:200px;">
                <div class="spinner-border text-gold me-2" role="status"></div>
                <div>Modül yükleniyor...</div>
            </div>
        `;
    }

    try {
        let module;
        
        switch (moduleId) {
            case 'dashboard':
                module = await import('./modules/admin/dashboard.js');
                if (module.initDashboard) await module.initDashboard();
                break;

            case 'content':
                module = await import('./modules/admin/content.js');
                if (module.initContentPage) await module.initContentPage();
                break;

            case 'users':
                module = await import('./modules/admin/users.js');
                if (module.initUsersPage) await module.initUsersPage();
                break;

            case 'reports':
                module = await import('./modules/admin/reports.js');
                if (module.initReportsPage) await module.initReportsPage();
                break;
                
            case 'questions':
                module = await import('./modules/admin/questions.js');
                if (module.initQuestionsPage) await module.initQuestionsPage();
                break;

            // Diğer modüller buraya eklenebilir...
            
            default:
                // Modülü olmayan basit sayfalar (örn: legislation) için bir şey yapma
                break;
        }

        // Başarıyla yüklendi işaretini koy
        loadedModules[moduleId] = true;

    } catch (error) {
        console.error(`❌ Modül Yükleme Hatası (${moduleId}):`, error);
        container.innerHTML = `
            <div class="alert alert-danger m-4">
                <h4>Modül Yüklenemedi</h4>
                <p>Dosya: /js/modules/admin/${moduleId}.js</p>
                <small>${error.message}</small>
            </div>
        `;
    }
}

/**
 * 4. SIDEBAR İŞARETLEYİCİ
 */
function highlightSidebar(hash) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    // Tüm aktifleri temizle
    sidebar.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Hash ile biten linki bul ve aktif yap
    const activeLink = Array.from(sidebar.querySelectorAll('a.nav-item')).find(link => {
        const href = link.getAttribute('href');
        return href && href.endsWith(hash);
    });

    if (activeLink) activeLink.classList.add('active');
}