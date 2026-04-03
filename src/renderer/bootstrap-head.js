(() => {
  try {
    const bootstrapMainStage =
      typeof window.electronAPI?.env?.bootstrapMainStage === 'string'
        ? window.electronAPI.env.bootstrapMainStage
        : null;

    if (bootstrapMainStage) {
      document.documentElement.dataset.bootstrapMainStage = bootstrapMainStage;
    }
  } catch {}

  try {
    const params = new URLSearchParams(window.location.search);
    const rawSnapshot = params.get('infiluxBootstrapTheme');
    if (rawSnapshot) {
      const snapshot = JSON.parse(decodeURIComponent(rawSnapshot));
      const root = document.documentElement;
      const theme = typeof snapshot?.theme === 'string' ? snapshot.theme : null;
      const systemShouldUseDarkColors = Boolean(snapshot?.systemShouldUseDarkColors);
      let mode = null;

      if (theme === 'light') {
        mode = 'light';
      } else if (theme === 'dark') {
        mode = 'dark';
      } else if (theme === 'system') {
        mode = systemShouldUseDarkColors ? 'dark' : 'light';
      }

      if (mode === 'light') {
        document.documentElement.classList.remove('dark');
      } else if (mode === 'dark') {
        document.documentElement.classList.add('dark');
      }

      if (mode) {
        root.dataset.themeMode = mode;
      }
      if (theme) {
        root.dataset.themeSource = theme;
      }
    }
  } catch {}

  try {
    const locale =
      typeof window.electronAPI?.env?.bootstrapLocale === 'string'
        ? window.electronAPI.env.bootstrapLocale
        : navigator.language;
    document.documentElement.lang = String(locale).toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
  } catch {
    document.documentElement.lang = 'en';
  }
})();
