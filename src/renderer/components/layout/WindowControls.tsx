import { Minus, Square, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n';

// Platform detection stays at module scope to avoid conditional hooks.
const isMac = typeof window !== 'undefined' && window.electronAPI?.env?.platform === 'darwin';

/**
 * Windows-style window control buttons (minimize, maximize/restore, close)
 * Only rendered on Windows/Linux where we use frameless windows
 */
export function WindowControls() {
  const { t } = useI18n();
  const [isMaximized, setIsMaximized] = useState(false);
  const minimizeLabel = t('Minimize');
  const restoreLabel = t('Restore');
  const maximizeLabel = t('Maximize');
  const closeLabel = t('Close');

  const handleMinimize = useCallback(() => {
    window.electronAPI.window.minimize();
  }, []);

  const handleMaximize = useCallback(() => {
    window.electronAPI.window.maximize();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI.window.close();
  }, []);

  useEffect(() => {
    if (isMac) return;

    window.electronAPI.window.isMaximized().then(setIsMaximized);

    const unsubscribe = window.electronAPI.window.onMaximizedChange(setIsMaximized);
    return unsubscribe;
  }, []);

  if (isMac) {
    return null;
  }

  return (
    <div className="control-window-controls shrink-0">
      <button
        type="button"
        onClick={handleMinimize}
        className="control-window-button no-drag"
        aria-label={minimizeLabel}
        title={minimizeLabel}
      >
        <Minus className="h-4 w-4 opacity-80" strokeWidth={1.5} />
      </button>

      <button
        type="button"
        onClick={handleMaximize}
        className="control-window-button no-drag"
        aria-label={isMaximized ? restoreLabel : maximizeLabel}
        title={isMaximized ? restoreLabel : maximizeLabel}
      >
        {isMaximized ? (
          <svg
            className="h-3.5 w-3.5 opacity-80"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            role="img"
            aria-label={restoreLabel}
          >
            <path d="M2 3h5v5H2z" />
            <path d="M3 3V2h5v5H7" />
          </svg>
        ) : (
          <Square className="h-3.5 w-3.5 opacity-80" strokeWidth={1.5} />
        )}
      </button>

      <button
        type="button"
        onClick={handleClose}
        className="control-window-button no-drag"
        data-tone="close"
        aria-label={closeLabel}
        title={closeLabel}
      >
        <X className="h-4 w-4 opacity-80" strokeWidth={1.5} />
      </button>
    </div>
  );
}
