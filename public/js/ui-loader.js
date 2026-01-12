
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
    const fullName = [profile?.ad, profile?.soyad].filter(Boolean).join(' ').trim()
        || profile?.displayName
        || user.displayName
        || user.email?.split('@')[0]
        || 'Kullanıcı';
    const initials = getInitials(fullName, user.email);
    const email = user.email;
    const photoUrl = profile?.photoURL || user.photoURL || null;

    document.querySelectorAll('.user-name').forEach(el => el.textContent = initials);
    document.querySelectorAll('.user-email').forEach(el => el.textContent = email || '');
    document.querySelectorAll('.user-avatar-initial').forEach(el => el.textContent = initials);
    document.querySelectorAll('.user-avatar-circle').forEach(circle => {
        const img = circle.querySelector('.user-avatar-image');
        if (img && photoUrl) {
            img.src = photoUrl;
            img.alt = `${fullName} profil fotoğrafı`;
            circle.classList.add('has-photo');
        } else if (img) {
            img.removeAttribute('src');
            circle.classList.remove('has-photo');
        }
    });
}

function getInitials(name, emailFallback) {
    const base = name?.trim() || emailFallback?.split('@')[0] || '';
    const parts = base.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    if (parts.length === 1) {
        return parts[0][0]?.toUpperCase() || '?';
    }
    return '?';
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
