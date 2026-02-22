(function applyInitialTheme() {
  var theme = null;
  try {
    theme = localStorage.getItem('theme');
  } catch (e) {
    theme = null;
  }

  if (theme !== 'light' && theme !== 'dark') {
    theme = 'dark';
  }

  document.documentElement.setAttribute('data-theme', theme);
})();
