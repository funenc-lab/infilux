import { describe, expect, it } from 'vitest';

describe('bootstrap locale shared helpers', () => {
  it('extracts a bootstrap locale from persisted settings data', async () => {
    const { extractBootstrapLocaleFromSettingsData } = await import('../bootstrapLocale');

    expect(
      extractBootstrapLocaleFromSettingsData({
        'enso-settings': {
          state: {
            language: 'zh-CN',
          },
        },
      })
    ).toBe('zh');
  });

  it('round-trips a bootstrap locale through the additional argument format', async () => {
    const { encodeBootstrapLocaleArgument, parseBootstrapLocaleFromArgv } = await import(
      '../bootstrapLocale'
    );

    expect(parseBootstrapLocaleFromArgv(['electron', encodeBootstrapLocaleArgument('zh')])).toBe(
      'zh'
    );
  });

  it('returns null when bootstrap locale data is unavailable', async () => {
    const { extractBootstrapLocaleFromSettingsData, parseBootstrapLocaleFromArgv } = await import(
      '../bootstrapLocale'
    );

    expect(extractBootstrapLocaleFromSettingsData({})).toBeNull();
    expect(parseBootstrapLocaleFromArgv(['electron'])).toBeNull();
  });
});
