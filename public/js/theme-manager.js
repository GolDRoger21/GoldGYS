export function resolveTheme() {
  let theme = null;
  try {
    theme = localStorage.getItem('theme');
  } catch (_) {
    theme = null;
  }
  return theme === 'light' || theme === 'dark' ? theme : 'dark';
}

export function applyTheme(theme = resolveTheme()) {
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || resolveTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem('theme', next);
  } catch (_) {}
  applyTheme(next);
  return next;
}

export function syncThemeToggleIcon(theme, toggleElement = document.getElementById('themeToggle')) {
  if (!toggleElement) return;

  const sunIcon = toggleElement.querySelector('.icon-sun');
  const moonIcon = toggleElement.querySelector('.icon-moon');
  if (!sunIcon || !moonIcon) return;

  if (theme === 'dark') {
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
    return;
  }

  sunIcon.style.display = 'none';
  moonIcon.style.display = 'block';
}
