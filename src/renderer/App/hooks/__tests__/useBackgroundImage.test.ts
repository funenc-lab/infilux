import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/stores/settings', () => ({
  useSettingsStore: vi.fn(),
}));

import { applyBackgroundImageOverlay, syncBackgroundImageOverlay } from '../useBackgroundImage';

function createTarget() {
  const tokens = new Set<string>();
  let backgroundColor = '';
  const properties = new Map<string, string>();

  return {
    target: {
      classList: {
        add: vi.fn((token: string) => {
          tokens.add(token);
        }),
        remove: vi.fn((token: string) => {
          tokens.delete(token);
        }),
      },
      style: {
        get backgroundColor() {
          return backgroundColor;
        },
        set backgroundColor(value: string) {
          backgroundColor = value;
        },
        setProperty: vi.fn((name: string, value: string) => {
          properties.set(name, value);
        }),
        removeProperty: vi.fn((name: string) => {
          properties.delete(name);
        }),
      },
    },
    tokens,
    properties,
    getBackgroundColor: () => backgroundColor,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('applyBackgroundImageOverlay', () => {
  it('enables background-image overlay using only panel opacity state', () => {
    const { target, tokens, properties, getBackgroundColor } = createTarget();

    applyBackgroundImageOverlay(target, true, 0.85);

    expect(tokens.has('bg-image-enabled')).toBe(true);
    expect(getBackgroundColor()).toBe('transparent');
    expect(properties.get('--panel-bg-opacity')).toBe('0.15');
    expect(properties.has('--accent')).toBe(false);
    expect(properties.has('--background')).toBe(false);
  });

  it('clears overlay state when disabled', () => {
    const { target, tokens, properties, getBackgroundColor } = createTarget();

    applyBackgroundImageOverlay(target, true, 0.85);
    applyBackgroundImageOverlay(target, false, 0.85);

    expect(tokens.has('bg-image-enabled')).toBe(false);
    expect(getBackgroundColor()).toBe('');
    expect(properties.has('--panel-bg-opacity')).toBe(false);
  });

  it('clamps panel opacity to the valid range', () => {
    const highOpacity = createTarget();
    applyBackgroundImageOverlay(highOpacity.target, true, 2);
    expect(highOpacity.properties.get('--panel-bg-opacity')).toBe('0');

    const lowOpacity = createTarget();
    applyBackgroundImageOverlay(lowOpacity.target, true, -1);
    expect(lowOpacity.properties.get('--panel-bg-opacity')).toBe('1');
  });
});

describe('syncBackgroundImageOverlay', () => {
  it('applies the overlay to the target and clears it during cleanup', () => {
    const { target, tokens, properties, getBackgroundColor } = createTarget();
    const cleanup = syncBackgroundImageOverlay(target, true, 0.6);

    expect(tokens.has('bg-image-enabled')).toBe(true);
    expect(getBackgroundColor()).toBe('transparent');
    expect(properties.get('--panel-bg-opacity')).toBe('0.4');

    cleanup();

    expect(tokens.has('bg-image-enabled')).toBe(false);
    expect(getBackgroundColor()).toBe('');
    expect(properties.has('--panel-bg-opacity')).toBe(false);
  });
});
