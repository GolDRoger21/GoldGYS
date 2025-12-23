/**
 * @file UI Loader & Interaction Manager
 * @description Handles dynamic loading of UI components (headers, footers), 
 *              theme management (dark/light mode), and core UI interactions 
 *              like mobile menus and user dropdowns.
 */

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ensureUserDocument } from './user-profile.js';

const COMPONENTS_PATH = '../components/layouts';

/**
 * Fetches and injects HTML content for a component.
 * @param {string} elementId - The ID of the element to inject HTML into.
 * @param {string} filePath - The path to the component's HTML file.
 */
async function loadComponent(elementId, filePath) {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Failed to load: ${filePath}`);
    element.innerHTML = await response.text();
  } catch (error) {
    console.error(`Error loading component ${filePath}:`, error);
    // Optional: Inject fallback HTML here if needed
  }
}

/**
 * Manages the color theme (dark/light mode).
 */
function initTheme() {
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const storedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', storedTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });
  }
}

/**
 * Sets up the mobile navigation toggle for the public-facing site.
 */
function setupPublicNav() {
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }
}

/**
 * Initializes the layout for public-facing pages (e.g., landing page).
 */
export async function initPublicLayout() {
  await loadComponent('public-header', `${COMPONENTS_PATH}/public-header.html`);
  await loadComponent('public-footer', `${COMPONENTS_PATH}/public-footer.html`);
  initTheme();
  setupPublicNav();
}

/**
 * Initializes the layout for authentication pages (login/register).
 */
export async function initAuthLayout() {
  // No dynamic header/footer needed for the new login page design
  initTheme(); 
}

/**
 * Initializes the main application layout for authenticated users.
 */
export async function initLayout(pageKey) {
  await Promise.all([
    loadComponent('header-area', `../components/layouts/admin-header.html`),
    // loadComponent('sidebar-area', `../partials/sidebar.html`), // Removed sidebar
    loadComponent('footer-area', `../components/layouts/admin-footer.html`)
  ]);
  initTheme();
  setupAppInteractions();
  
  // Handle auth state and user data
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const profile = await ensureUserDocument(user);
      updateUserInfo(profile, user);
      // Activate the current page link in the header
      const header = document.getElementById('header-area');
      if (header && pageKey) {
        // Updated to find the link in the header instead of the sidebar.
        // This assumes the links are in the header now.
        const link = header.querySelector(`a[href*="/${pageKey}.html"]`);
        if (link) {
          link.classList.add('active');
        }
      }
    } else {
      // If auth is required, redirect to login
      window.location.href = '/';
    }
  });
}

/**
 * Updates user-specific information in the UI.
 */
function updateUserInfo(profile, user) {
    const displayName = profile?.displayName || user.email?.split('@')[0] || 'User';
    const initial = displayName.charAt(0).toUpperCase();

    document.querySelectorAll('.user-name').forEach(el => el.textContent = displayName);
    document.querySelectorAll('.user-email').forEach(el => el.textContent = user.email);
    document.querySelectorAll('.user-avatar-initial').forEach(el => el.textContent = initial);
}

/**
 * Sets up interactions for the main app (profile dropdown, logout).
 */
function setupAppInteractions() {
    const header = document.getElementById('header-area');
    if (!header) return;

    header.addEventListener('click', (e) => {
        // Profile dropdown toggle
        if (e.target.closest('.user-menu-toggle')) {
            const dropdown = document.querySelector('.profile-dropdown');
            if (dropdown) dropdown.classList.toggle('open');
        }

        // Logout button
        if (e.target.closest('#logout-btn')) {
            auth.signOut().then(() => {
                window.location.href = '/';
            }).catch(console.error);
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const dropdown = document.querySelector('.profile-dropdown.open');
        if (dropdown && !e.target.closest('.user-menu-container')) {
            dropdown.classList.remove('open');
        }
    });
}
