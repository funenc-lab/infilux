import { describe, expect, it } from 'vitest';
import { Z_INDEX } from '../z-index';

describe('z-index tokens', () => {
  it('keeps the stacking hierarchy in ascending order', () => {
    expect(Z_INDEX.BASE).toBeLessThan(Z_INDEX.SETTINGS_WINDOW);
    expect(Z_INDEX.SETTINGS_WINDOW).toBeLessThan(Z_INDEX.DROPDOWN);
    expect(Z_INDEX.DROPDOWN).toBeLessThan(Z_INDEX.MODAL_BACKDROP);
    expect(Z_INDEX.MODAL_BACKDROP).toBeLessThan(Z_INDEX.MODAL_CONTENT);
    expect(Z_INDEX.MODAL_CONTENT).toBeLessThan(Z_INDEX.DROPDOWN_IN_MODAL);
    expect(Z_INDEX.DROPDOWN_IN_MODAL).toBeLessThan(Z_INDEX.NESTED_MODAL_BACKDROP);
    expect(Z_INDEX.NESTED_MODAL_BACKDROP).toBeLessThan(Z_INDEX.NESTED_MODAL_CONTENT);
    expect(Z_INDEX.NESTED_MODAL_CONTENT).toBeLessThan(Z_INDEX.DROPDOWN_IN_NESTED_MODAL);
    expect(Z_INDEX.DROPDOWN_IN_NESTED_MODAL).toBeLessThan(Z_INDEX.TOOLTIP);
    expect(Z_INDEX.TOOLTIP).toBeLessThan(Z_INDEX.TOAST);
    expect(Z_INDEX.TOAST).toBeLessThan(Z_INDEX.DEVTOOLS_OVERLAY);
  });

  it('exposes the expected token values for critical UI layers', () => {
    expect(Z_INDEX).toMatchObject({
      BASE: 0,
      SETTINGS_WINDOW: 10,
      MODAL_BACKDROP: 50,
      MODAL_CONTENT: 51,
      TOOLTIP: 100,
      TOAST: 110,
      DEVTOOLS_OVERLAY: 120,
    });
  });
});
