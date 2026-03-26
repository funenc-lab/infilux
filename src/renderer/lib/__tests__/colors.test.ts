import { describe, expect, it } from 'vitest';
import { hexToRgba, normalizeHexColor } from '../colors';

describe('colors utilities', () => {
  it('converts valid hex colors to rgba strings', () => {
    expect(hexToRgba('#112233', 0.5)).toBe('rgba(17, 34, 51, 0.5)');
    expect(hexToRgba('  #AABBCC  ', 1)).toBe('rgba(170, 187, 204, 1)');
  });

  it('rejects invalid hex colors and alpha values', () => {
    expect(hexToRgba('112233', 0.5)).toBeNull();
    expect(hexToRgba('#abcd', 0.5)).toBeNull();
    expect(hexToRgba('#112233', -0.1)).toBeNull();
    expect(hexToRgba('#112233', 1.1)).toBeNull();
    expect(hexToRgba('#112233', Number.NaN)).toBeNull();
    expect(hexToRgba(123 as unknown as string, 0.5)).toBeNull();
  });

  it('normalizes valid hex colors and falls back for invalid input', () => {
    expect(normalizeHexColor('  #AABBCC  ', '#123456')).toBe('#aabbcc');
    expect(normalizeHexColor('#abc', '#123456')).toBe('#123456');
    expect(normalizeHexColor('blue', '#123456')).toBe('#123456');
    expect(normalizeHexColor(123 as unknown as string, '#123456')).toBe('#123456');
  });
});
