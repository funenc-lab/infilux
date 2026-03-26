import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const remoteI18nTestDoubles = vi.hoisted(() => {
  const translate = vi.fn();
  const getCurrentLocale = vi.fn();

  function reset() {
    translate.mockReset();
    getCurrentLocale.mockReset();
    getCurrentLocale.mockReturnValue('en');
  }

  return {
    translate,
    getCurrentLocale,
    reset,
  };
});

vi.mock('@shared/i18n', () => ({
  translate: remoteI18nTestDoubles.translate,
}));

vi.mock('../../i18n', () => ({
  getCurrentLocale: remoteI18nTestDoubles.getCurrentLocale,
}));

describe('RemoteI18n', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    remoteI18nTestDoubles.reset();
    remoteI18nTestDoubles.translate.mockImplementation(
      (_locale: string, key: string, params?: Record<string, string | number>) =>
        params ? `${key}:${JSON.stringify(params)}` : key
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('translates remote keys and normalizes error details', async () => {
    const {
      translateRemote,
      getRemoteErrorDetail,
      createRemoteError,
      createUnsupportedRemoteFeatureError,
    } = await import('../RemoteI18n');

    expect(translateRemote('remote.key', { value: 1 })).toBe('remote.key:{"value":1}');
    expect(remoteI18nTestDoubles.translate).toHaveBeenCalledWith('en', 'remote.key', { value: 1 });

    expect(getRemoteErrorDetail('  detail  ')).toBe('detail');
    expect(getRemoteErrorDetail(new Error(' boom '))).toBe('boom');
    expect(getRemoteErrorDetail('   ')).toBeUndefined();
    expect(getRemoteErrorDetail(null)).toBeUndefined();
    expect(getRemoteErrorDetail({ code: 500 })).toBe('[object Object]');

    expect(createRemoteError('base.message', undefined, 'extra detail').message).toBe(
      'base.message\nextra detail'
    );
    expect(createRemoteError('same.message', undefined, 'same.message').message).toBe(
      'same.message'
    );
    expect(createRemoteError('error.message', undefined, new Error(' nested ')).message).toBe(
      'error.message\nnested'
    );

    const unsupported = createUnsupportedRemoteFeatureError('submodules');
    expect(unsupported.message).toContain('is not supported for remote repositories yet');
    expect(remoteI18nTestDoubles.translate).toHaveBeenCalledWith('en', 'Submodules', undefined);
  });
});
