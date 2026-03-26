import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';

const BACKGROUND_IMAGE_CLASS = 'bg-image-enabled';
const PANEL_BG_OPACITY_VAR = '--panel-bg-opacity';

interface BackgroundImageOverlayTarget {
  classList: {
    add: (token: string) => void;
    remove: (token: string) => void;
  };
  style: {
    backgroundColor: string;
    setProperty: (name: string, value: string) => void;
    removeProperty: (name: string) => void;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clearBackgroundImageOverlay(target: BackgroundImageOverlayTarget): void {
  target.classList.remove(BACKGROUND_IMAGE_CLASS);
  target.style.backgroundColor = '';
  target.style.removeProperty(PANEL_BG_OPACITY_VAR);
}

export function syncBackgroundImageOverlay(
  target: BackgroundImageOverlayTarget,
  backgroundImageEnabled: boolean,
  backgroundOpacity: number
): () => void {
  applyBackgroundImageOverlay(target, backgroundImageEnabled, backgroundOpacity);

  return () => {
    clearBackgroundImageOverlay(target);
  };
}

export function applyBackgroundImageOverlay(
  target: BackgroundImageOverlayTarget,
  backgroundImageEnabled: boolean,
  backgroundOpacity: number
): void {
  if (!backgroundImageEnabled) {
    clearBackgroundImageOverlay(target);
    return;
  }

  const panelOpacity = Number(clamp(1 - backgroundOpacity, 0, 1).toFixed(3));

  target.classList.add(BACKGROUND_IMAGE_CLASS);
  target.style.backgroundColor = 'transparent';
  target.style.setProperty(PANEL_BG_OPACITY_VAR, String(panelOpacity));
}

export function useBackgroundImage() {
  const backgroundImageEnabled = useSettingsStore((s) => s.backgroundImageEnabled);
  const backgroundOpacity = useSettingsStore((s) => s.backgroundOpacity);

  useEffect(() => {
    return syncBackgroundImageOverlay(document.body, backgroundImageEnabled, backgroundOpacity);
  }, [backgroundImageEnabled, backgroundOpacity]);
}
