// ========== DEĞİŞİKLİK ÖNCESİ (REFERANS) ==========
// const COMPONENTS_PATH = '../components/layouts';
// async function loadComponent(elementId, filePath) { ... }

// ========== GÜNCELLENEN KISIM ==========

// 1. Mutlak yol kullanımı (Her sayfadan çalışması için)
const COMPONENTS_PATH = '/components/layouts'; // Başındaki "/" işareti kök dizini ifade eder.
const COMPONENTS_COMMON_PATH = '/components';  // Ortak bileşenler için

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ensureUserDocument } from './user-profile.js';

async function loadComponent(elementId, filePath) {
  const element = document.getElementById(elementId);
  if (!element) return; // Element sayfada yoksa hata verme, çık.

  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`HTTP ${response.status} - ${filePath}`);
    element.innerHTML = await response.text();
  } catch (error) {
    console.error(`Bileşen yüklenemedi: ${filePath}`, error);
  }
}

// ... initTheme fonksiyonu aynen kalabilir ...

export async function initLayout(pageKey) {
  // Önce bileşenlerin yüklenmesini BEKLE (await Promise.all)
  await Promise.all([
     // Dosya yollarını düzelttik ve dashboard header'ı admin ile ayırdık veya birleştirdik
     // Eğer dashboard için "header.html" kullanıyorsanız:
    loadComponent('header-area', `/components/header.html`), 
    // Admin sayfaları için ayrı bir initAdminLayout fonksiyonu yazabilir veya buraya if/else koyabilirsiniz.
    // Şimdilik dashboard odaklı gidiyoruz.
    loadComponent('footer-area', `/components/footer.html`)
  ]);

  initTheme();
  
  // Header HTML'i yüklendikten SONRA eventleri bağla
  setupAppInteractions(); 
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // Veriyi çek
      const profile = await ensureUserDocument(user);
      // Header elementleri artık sahnede olduğu için güncelleyebiliriz
      updateUserInfo(profile, user);
      
      // Aktif linki işaretle
      const header = document.getElementById('header-area');
      if (header && pageKey) {
        const link = header.querySelector(`a[data-page="${pageKey}"]`);
        if (link) link.classList.add('active');
      }
    } else {
      window.location.href = '/login.html';
    }
  });
}

function updateUserInfo(profile, user) {
    const displayName = profile?.ad || profile?.displayName || user.email?.split('@')[0] || 'Kullanıcı';
    const initial = displayName.charAt(0).toUpperCase();
    const email = user.email;

    // Class selector kullanarak hem dashboard hem admin panelini günceller
    document.querySelectorAll('.user-name').forEach(el => el.textContent = displayName);
    document.querySelectorAll('.user-email').forEach(el => el.textContent = email);
    document.querySelectorAll('.user-avatar-initial').forEach(el => el.textContent = initial);
}

function setupAppInteractions() {
    // Event Delegation kullanarak tüm sayfadaki tıklamaları yakalar
    // Bu sayede dinamik yüklenen elementler için tekrar listener eklemeye gerek kalmaz.
    document.body.addEventListener('click', (e) => {
        
        // 1. Profil Menüsü Açma/Kapama
        const toggleBtn = e.target.closest('.user-menu-toggle');
        if (toggleBtn) {
            const container = toggleBtn.closest('.user-menu-container');
            const dropdown = container.querySelector('.profile-dropdown');
            
            // Diğer açık menüleri kapat
            document.querySelectorAll('.profile-dropdown.active').forEach(d => {
                if(d !== dropdown) d.classList.remove('active');
            });

            if (dropdown) dropdown.classList.toggle('active');
            e.stopPropagation(); // Event'in yukarı çıkmasını engelle
            return;
        }

        // 2. Dışarı tıklayınca kapatma
        if (!e.target.closest('.profile-dropdown') && !e.target.closest('.user-menu-toggle')) {
            document.querySelectorAll('.profile-dropdown.active').forEach(d => {
                d.classList.remove('active');
            });
        }

        // 3. Çıkış Butonu
        if (e.target.closest('#logout-btn')) {
            if(confirm('Çıkış yapmak istiyor musunuz?')) {
                auth.signOut().then(() => {
                    window.location.href = '/login.html';
                });
            }
        }
    });
}