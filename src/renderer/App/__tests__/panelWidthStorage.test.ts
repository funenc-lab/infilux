import { describe, expect, it } from 'vitest';
import { restorePanelWidthFromStorage } from '../panelWidthStorage';

describe('restorePanelWidthFromStorage', () => {
  it('falls back to the default width when the stored value is zero', () => {
    expect(restorePanelWidthFromStorage('0', { min: 180, max: 500, fallback: 256 })).toBe(256);
  });

  it('falls back to the default width when the stored value is invalid', () => {
    expect(restorePanelWidthFromStorage('abc', { min: 180, max: 500, fallback: 256 })).toBe(256);
  });

  it('clamps values below the minimum width', () => {
    expect(restorePanelWidthFromStorage('120', { min: 180, max: 500, fallback: 256 })).toBe(180);
  });

  it('clamps values above the maximum width', () => {
    expect(restorePanelWidthFromStorage('640', { min: 180, max: 500, fallback: 256 })).toBe(500);
  });

  it('keeps valid persisted widths unchanged', () => {
    expect(restorePanelWidthFromStorage('320', { min: 180, max: 500, fallback: 256 })).toBe(320);
  });
});
