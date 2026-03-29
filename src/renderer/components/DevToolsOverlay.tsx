import { useEffect, useState } from 'react';
import { getRendererPlatform } from '@/lib/electronEnvironment';
import { Z_INDEX } from '@/lib/z-index';

/**
 * When DevTools is docked on the left, traffic lights are moved from (16,16)
 * to (240,16) via setWindowButtonPosition. This overlay covers the ORIGINAL
 * position as a visual dead-zone, preventing accidental interaction with any
 * content that may appear beneath the old traffic-light area.
 *
 * This div intentionally blocks ALL mouse events (pointer-events: auto by
 * default) in the original traffic-light region. Traffic lights have been
 * MOVED (not hidden), so users should use the relocated buttons at (240,16)
 * or keyboard shortcuts (Cmd+Q, etc.) instead.
 *
 * macOS only. Renders nothing on other platforms or when DevTools is closed.
 */
export function DevToolsOverlay() {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const isMac = getRendererPlatform() === 'darwin';

  useEffect(() => {
    if (!isMac) return;

    const cleanup = window.electronAPI.window.onDevToolsStateChange((isOpen: boolean) => {
      setIsDevToolsOpen(isOpen);
    });
    return cleanup;
  }, [isMac]);

  if (!isDevToolsOpen || !isMac) {
    return null;
  }

  return (
    <div
      className="fixed left-0 top-0 h-[52px] w-[80px]"
      style={{ zIndex: Z_INDEX.DEVTOOLS_OVERLAY }}
    />
  );
}
