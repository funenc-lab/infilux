import { REPOSITORY_URL } from '@shared/branding';
import { ExternalLink, MoreHorizontal, RefreshCw, Settings, Terminal, X } from 'lucide-react';
import { useCallback } from 'react';
import logoImage from '@/assets/logo.svg';
import {
  Menu,
  MenuItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
  TitleBarMenuPopup,
} from '@/components/ui/menu';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { WindowControls } from './WindowControls';

// Platform detection is kept at module scope to avoid conditional hooks.
const isMac = typeof window !== 'undefined' && window.electronAPI?.env?.platform === 'darwin';

interface WindowTitleBarProps {
  onOpenSettings?: () => void;
}

/**
 * Custom title bar for frameless windows on Windows/Linux.
 * Keep this layer focused on window identity and system actions.
 */
export function WindowTitleBar({ onOpenSettings }: WindowTitleBarProps) {
  const { t } = useI18n();

  // Hooks must be declared before any conditional return.
  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  const handleOpenDevTools = useCallback(() => {
    window.electronAPI.window.openDevTools();
  }, []);

  const handleOpenExternal = useCallback((url: string) => {
    window.electronAPI.shell.openExternal(url);
  }, []);

  // macOS uses the native hiddenInset title bar.
  if (isMac) {
    return null;
  }

  const iconButtonClass = cn(
    'control-icon-button flex h-8 w-8 items-center justify-center rounded-md',
    'text-muted-foreground hover:text-foreground hover:bg-accent/60',
    'transition-colors duration-150'
  );

  return (
    <div className="relative z-50 flex h-8 shrink-0 items-center justify-between border-b bg-background drag-region select-none">
      <div className="flex h-8 items-center gap-1.5 px-2 no-drag">
        <img src={logoImage} alt="Infilux" className="h-5 w-5" />
        <span className="text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
          Infilux
        </span>
      </div>

      <div className="flex items-center no-drag">
        <Menu>
          <MenuTrigger
            render={
              <button type="button" className={iconButtonClass} aria-label={t('More')}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            }
          />
          <TitleBarMenuPopup align="end" sideOffset={6} className="min-w-[180px]">
            {onOpenSettings ? (
              <>
                <MenuItem onClick={onOpenSettings}>
                  <Settings className="h-3.5 w-3.5" />
                  {t('Settings')}
                  <MenuShortcut>Ctrl+,</MenuShortcut>
                </MenuItem>
                <MenuSeparator />
              </>
            ) : null}
            <MenuItem onClick={handleReload}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('Reload')}
              <MenuShortcut>Ctrl+R</MenuShortcut>
            </MenuItem>
            <MenuItem onClick={handleOpenDevTools}>
              <Terminal className="h-3.5 w-3.5" />
              {t('Developer Tools')}
              <MenuShortcut>F12</MenuShortcut>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => handleOpenExternal(REPOSITORY_URL)}>
              <ExternalLink className="h-3.5 w-3.5" />
              {t('GitHub')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => window.electronAPI.window.close()}>
              <X className="h-3.5 w-3.5" />
              {t('Exit')}
              <MenuShortcut>Alt+F4</MenuShortcut>
            </MenuItem>
          </TitleBarMenuPopup>
        </Menu>

        <div className="mx-1 h-4 w-px bg-border" />

        <WindowControls />
      </div>
    </div>
  );
}
