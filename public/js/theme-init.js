(() => {
  try {
    const storedTheme = localStorage.getItem('theme');
    // const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    // Default to dark for consistency with login page and brand
    const theme = storedTheme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    // Fail silently to avoid blocking page paint.
  }
})();
