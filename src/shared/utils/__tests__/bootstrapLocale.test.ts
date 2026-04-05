import { describe, expect, it } from 'vitest';
import {
  encodeBootstrapLocaleArgument,
  extractBootstrapLocaleFromSettingsData,
  parseBootstrapLocaleFromArgv,
} from '../bootstrapLocale';

const BOOTSTRAP_LOCALE_ARGUMENT_PREFIX = '--infilux-bootstrap-locale=';

describe('bootstrap locale shared helpers', () => {
  it('extracts a bootstrap locale from persisted settings data', () => {
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

  it('returns null for malformed settings payloads and non-string language values', () => {
    const invalidPayloads = [
      null,
      {},
      { 'enso-settings': null },
      { 'enso-settings': {} },
      { 'enso-settings': { state: null } },
      { 'enso-settings': { state: { language: 1 } } },
    ];

    for (const payload of invalidPayloads) {
      expect(extractBootstrapLocaleFromSettingsData(payload)).toBeNull();
    }
  });

  it('round-trips a bootstrap locale through the additional argument format', () => {
    expect(parseBootstrapLocaleFromArgv(['electron', encodeBootstrapLocaleArgument('zh')])).toBe(
      'zh'
    );
  });

  it('returns null when bootstrap locale argv data is unavailable or malformed', () => {
    expect(parseBootstrapLocaleFromArgv(['electron'])).toBeNull();
    expect(
      parseBootstrapLocaleFromArgv([
        'electron',
        `${BOOTSTRAP_LOCALE_ARGUMENT_PREFIX}invalid%ZZlocale`,
      ])
    ).toBeNull();
  });
});
