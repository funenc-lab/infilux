import { REPOSITORY_URL } from '@shared/branding';
import { ExternalLink, MoreHorizontal, RefreshCw, Settings, Terminal, X } from 'lucide-react';
import { useCallback } from 'react';
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
import { AppResourceStatusPopover } from './AppResourceStatusPopover';
import { BrandMark } from './BrandMark';
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

  const iconButtonClass = cn('control-window-button');

  return (
    <div className="control-titlebar relative z-50 shrink-0 px-2 drag-region select-none">
      <div className="control-titlebar-brand no-drag">
        <span className="control-titlebar-brand-mark">
          <BrandMark className="h-4 w-4" />
        </span>
        <div className="control-titlebar-brand-stack">
          <span className="control-titlebar-brand-title">Infilux</span>
          <span className="control-titlebar-brand-subtitle">AI Collaboration Console</span>
        </div>
      </div>

      <div className="control-titlebar-actions no-drag">
        {onOpenSettings ? (
          <button
            type="button"
            className={iconButtonClass}
            onClick={onOpenSettings}
            aria-label={t('Settings')}
            title={t('Settings')}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        ) : null}

        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                className={iconButtonClass}
                aria-label={t('More')}
                title={t('More')}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            }
          />
          <TitleBarMenuPopup align="end" sideOffset={6} className="min-w-[180px]">
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

        <AppResourceStatusPopover className={iconButtonClass} />

        <WindowControls />
      </div>
    </div>
  );
}
