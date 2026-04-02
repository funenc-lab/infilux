import type { BootstrapThemeMode, BootstrapThemeSnapshot } from '@shared/utils/bootstrapTheme';
import { isTerminalThemeDark } from './ghosttyTheme';

export function resolveBootstrapThemeMode(
  snapshot: BootstrapThemeSnapshot | null | undefined
): BootstrapThemeMode {
  if (!snapshot) {
    return 'dark';
  }

  switch (snapshot.theme) {
    case 'light':
      return 'light';
    case 'dark':
      return 'dark';
    case 'system':
      return snapshot.systemShouldUseDarkColors ? 'dark' : 'light';
    case 'sync-terminal':
      return isTerminalThemeDark(snapshot.terminalTheme) ? 'dark' : 'light';
  }
}

export function applyBootstrapTheme(snapshot: BootstrapThemeSnapshot | null | undefined): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const mode = resolveBootstrapThemeMode(snapshot);

  root.classList.toggle('dark', mode === 'dark');
  if ('dataset' in root && root.dataset) {
    root.dataset.themeMode = mode;
    if (snapshot?.theme) {
      root.dataset.themeSource = snapshot.theme;
    }
  }
}
