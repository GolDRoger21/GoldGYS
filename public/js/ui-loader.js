
import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ensureUserDocument } from './user-profile.js';

async function loadComponent(elementId, filePath) {
  const element = document.getElementById(elementId);
  if (!element) return; 

  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`HTTP ${response.status} - ${filePath}`);
    element.innerHTML = await response.text();
  } catch (error) {
    console.error(`Bileşen yüklenemedi: ${filePath}`, error);
  }
}

function initTheme() {
    const themeToggle = document.querySelector('[data-theme-toggle]');
    const themeIcon = document.querySelector('[data-theme-icon]');
    const storedTheme = localStorage.getItem('theme');

    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeIcon) {
            themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
        }
        localStorage.setItem('theme', theme);
    };

    if (storedTheme) {
        applyTheme(storedTheme);
    } else {
        // Sistem tercihini de kontrol edebilirsiniz
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
        });
    }
}


export async function initLayout(pageKey) {
  await Promise.all([
    loadComponent('header-area', `/components/header.html`), 
    loadComponent('footer-area', `/components/footer.html`)
  ]);

  // Tema fonksiyonunu HEMEN çağırıyoruz ki, event listener'lar eklensin.
  initTheme();
  
  setupAppInteractions(); 
  
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await ensureUserDocument(user);
      updateUserInfo(profile, user);
      
      const header = document.getElementById('header-area');
      if (header && pageKey) {
        const link = header.querySelector(`a[data-page="${pageKey}"]`);
        if (link) link.classList.add('active');
      }
    } else {
       // login olmayan sayfalarda hata vermemesi için kontrol
       if(pageKey !== 'login' && pageKey !== 'register') {
         window.location.href = '/login.html';
       }
    }
  });
}

function updateUserInfo(profile, user) {
    const displayName = profile?.ad || profile?.displayName || user.email?.split('@')[0] || 'Kullanıcı';
    const initial = displayName.charAt(0).toUpperCase();
    const email = user.email;

    document.querySelectorAll('.user-name').forEach(el => el.textContent = displayName);
    document.querySelectorAll('.user-email').forEach(el => el.textContent = email);
    document.querySelectorAll('.user-avatar-initial').forEach(el => el.textContent = initial);
}

function setupAppInteractions() {
    document.body.addEventListener('click', (e) => {
        
        const toggleBtn = e.target.closest('.user-menu-toggle');
        if (toggleBtn) {
            const container = toggleBtn.closest('.user-menu-container');
            const dropdown = container.querySelector('.profile-dropdown');
            
            document.querySelectorAll('.profile-dropdown.active').forEach(d => {
                if(d !== dropdown) d.classList.remove('active');
            });

            if (dropdown) dropdown.classList.toggle('active');
            e.stopPropagation();
            return;
        }

        if (!e.target.closest('.profile-dropdown') && !e.target.closest('.user-menu-toggle')) {
            document.querySelectorAll('.profile-dropdown.active').forEach(d => {
                d.classList.remove('active');
            });
        }

        if (e.target.closest('#logout-btn')) {
            if(confirm('Çıkış yapmak istiyor musunuz?')) {
                auth.signOut().then(() => {
                    window.location.href = '/login.html';
                });
            }
        }
    });
}
