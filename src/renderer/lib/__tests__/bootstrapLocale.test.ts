import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('bootstrapLocale', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefers the preload bootstrap locale and normalizes it', async () => {
    vi.stubGlobal('window', {
      electronAPI: {
        env: {
          bootstrapLocale: 'zh-CN',
        },
      },
    });

    const { resolveBootstrapLocale } = await import('../bootstrapLocale');

    expect(resolveBootstrapLocale()).toBe('zh');
  });

  it('falls back to the browser language when the preload locale is unavailable', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {
      language: 'en-US',
      platform: 'MacIntel',
    });

    const { resolveBootstrapLocale } = await import('../bootstrapLocale');

    expect(resolveBootstrapLocale()).toBe('en');
  });

  it('falls back to the default locale when browser globals are unavailable', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);

    const { resolveBootstrapLocale } = await import('../bootstrapLocale');

    expect(resolveBootstrapLocale()).toBe('en');
  });

  it('maps normalized locales to document language codes', async () => {
    const { resolveBootstrapDocumentLanguage } = await import('../bootstrapLocale');

    expect(resolveBootstrapDocumentLanguage('zh')).toBe('zh-CN');
    expect(resolveBootstrapDocumentLanguage('en')).toBe('en');
  });

  it('applies the resolved document language to the root element', async () => {
    const documentElement = { lang: 'en' };
    vi.stubGlobal('document', { documentElement });

    const { applyBootstrapLocaleToDocument } = await import('../bootstrapLocale');
    applyBootstrapLocaleToDocument('zh');

    expect(documentElement.lang).toBe('zh-CN');
  });

  it('skips document updates when the DOM is unavailable', async () => {
    vi.stubGlobal('document', undefined);

    const { applyBootstrapLocaleToDocument } = await import('../bootstrapLocale');

    expect(() => applyBootstrapLocaleToDocument('en')).not.toThrow();
  });
});
