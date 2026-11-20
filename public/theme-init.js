(function () {
  try {
    var pref = window.localStorage.getItem('goamaas_theme') || 'light';
    var prefersDark =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    var resolved = pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref === 'dark' ? 'dark' : 'light';
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    document.documentElement.style.colorScheme = resolved;
  } catch (e) {}
})();
