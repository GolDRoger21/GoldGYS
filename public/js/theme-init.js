(function applyInitialTheme() {
  var theme = null;
  try {
    theme = localStorage.getItem('theme');
  } catch (e) {
    theme = null;
  }

  if (theme !== 'light' && theme !== 'dark') {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = prefersDark ? 'dark' : 'light';
  }

  document.documentElement.setAttribute('data-theme', theme);
})();
