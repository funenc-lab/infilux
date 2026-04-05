import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_THEME_SEARCH_PARAM,
  encodeBootstrapThemeArgument,
  encodeBootstrapThemeSearchValue,
  extractBootstrapThemeSnapshotFromSettingsData,
  parseBootstrapThemeSnapshotFromArgv,
  parseBootstrapThemeSnapshotFromSearch,
  resolveStaticBootstrapThemeMode,
} from '../bootstrapTheme';

const BOOTSTRAP_THEME_ARGUMENT_PREFIX = '--infilux-bootstrap-theme=';

describe('bootstrap theme shared helpers', () => {
  it('extracts a bootstrap theme snapshot from persisted settings data', () => {
    expect(
      extractBootstrapThemeSnapshotFromSettingsData(
        {
          'enso-settings': {
            state: {
              theme: 'light',
              terminalTheme: 'Dracula',
            },
          },
        },
        false
      )
    ).toEqual({
      theme: 'light',
      terminalTheme: 'Dracula',
      systemShouldUseDarkColors: false,
    });
  });

  it('returns null for malformed persisted settings payloads and invalid theme values', () => {
    const invalidPayloads = [
      null,
      {},
      { 'enso-settings': null },
      { 'enso-settings': {} },
      { 'enso-settings': { state: null } },
      { 'enso-settings': { state: { theme: 'unknown' } } },
    ];

    for (const payload of invalidPayloads) {
      expect(extractBootstrapThemeSnapshotFromSettingsData(payload, true)).toBeNull();
    }
  });

  it('falls back to the default terminal theme when settings data contains blank terminal theme', () => {
    expect(
      extractBootstrapThemeSnapshotFromSettingsData(
        {
          'enso-settings': {
            state: {
              theme: 'dark',
              terminalTheme: '   ',
            },
          },
        },
        true
      )
    ).toEqual({
      theme: 'dark',
      terminalTheme: 'Dracula',
      systemShouldUseDarkColors: true,
    });
  });

  it('round-trips a bootstrap theme snapshot through the additional argument format', () => {
    const snapshot = {
      theme: 'system' as const,
      terminalTheme: 'Xcode WWDC',
      systemShouldUseDarkColors: true,
    };

    expect(
      parseBootstrapThemeSnapshotFromArgv(['electron', encodeBootstrapThemeArgument(snapshot)])
    ).toEqual(snapshot);
  });

  it('rejects missing and malformed argv snapshots while defaulting blank terminal themes', () => {
    expect(parseBootstrapThemeSnapshotFromArgv(['electron'])).toBeNull();
    expect(
      parseBootstrapThemeSnapshotFromArgv([
        'electron',
        `${BOOTSTRAP_THEME_ARGUMENT_PREFIX}%7Binvalid`,
      ])
    ).toBeNull();
    expect(
      parseBootstrapThemeSnapshotFromArgv([
        'electron',
        `${BOOTSTRAP_THEME_ARGUMENT_PREFIX}${encodeURIComponent('null')}`,
      ])
    ).toBeNull();
    expect(
      parseBootstrapThemeSnapshotFromArgv([
        'electron',
        `${BOOTSTRAP_THEME_ARGUMENT_PREFIX}${encodeURIComponent(
          JSON.stringify({
            theme: 'unknown',
            terminalTheme: 'Midnight',
            systemShouldUseDarkColors: false,
          })
        )}`,
      ])
    ).toBeNull();

    expect(
      parseBootstrapThemeSnapshotFromArgv([
        'electron',
        `${BOOTSTRAP_THEME_ARGUMENT_PREFIX}${encodeURIComponent(
          JSON.stringify({
            theme: 'dark',
            terminalTheme: '   ',
            systemShouldUseDarkColors: 1,
          })
        )}`,
      ])
    ).toEqual({
      theme: 'dark',
      terminalTheme: 'Dracula',
      systemShouldUseDarkColors: true,
    });
  });

  it('round-trips a bootstrap theme snapshot through the search parameter format', () => {
    const snapshot = {
      theme: 'system' as const,
      terminalTheme: 'Xcode WWDC',
      systemShouldUseDarkColors: false,
    };

    expect(
      parseBootstrapThemeSnapshotFromSearch(
        `?${BOOTSTRAP_THEME_SEARCH_PARAM}=${encodeBootstrapThemeSearchValue(snapshot)}`
      )
    ).toEqual(snapshot);
  });

  it('rejects missing and malformed search snapshots while defaulting blank terminal themes', () => {
    expect(parseBootstrapThemeSnapshotFromSearch('?other=value')).toBeNull();
    expect(
      parseBootstrapThemeSnapshotFromSearch(`?${BOOTSTRAP_THEME_SEARCH_PARAM}=%7Binvalid`)
    ).toBeNull();
    expect(
      parseBootstrapThemeSnapshotFromSearch(
        `?${BOOTSTRAP_THEME_SEARCH_PARAM}=${encodeURIComponent('null')}`
      )
    ).toBeNull();
    expect(
      parseBootstrapThemeSnapshotFromSearch(
        `?${BOOTSTRAP_THEME_SEARCH_PARAM}=${encodeURIComponent(
          JSON.stringify({
            theme: 'unknown',
            terminalTheme: 'Midnight',
            systemShouldUseDarkColors: false,
          })
        )}`
      )
    ).toBeNull();

    expect(
      parseBootstrapThemeSnapshotFromSearch(
        `?${BOOTSTRAP_THEME_SEARCH_PARAM}=${encodeURIComponent(
          JSON.stringify({
            theme: 'dark',
            terminalTheme: '',
            systemShouldUseDarkColors: 1,
          })
        )}`
      )
    ).toEqual({
      theme: 'dark',
      terminalTheme: 'Dracula',
      systemShouldUseDarkColors: true,
    });
  });

  it('normalizes legacy sync-terminal snapshots into system mode', () => {
    expect(
      parseBootstrapThemeSnapshotFromArgv([
        'electron',
        `${BOOTSTRAP_THEME_ARGUMENT_PREFIX}${encodeURIComponent(
          JSON.stringify({
            theme: 'sync-terminal',
            terminalTheme: 'Dracula',
            systemShouldUseDarkColors: true,
          })
        )}`,
      ])
    ).toEqual({
      theme: 'system',
      terminalTheme: 'Dracula',
      systemShouldUseDarkColors: true,
    });
  });

  it('resolves static bootstrap modes for all supported snapshot states', () => {
    expect(resolveStaticBootstrapThemeMode(null)).toBeNull();

    expect(
      resolveStaticBootstrapThemeMode({
        theme: 'light',
        terminalTheme: 'Dracula',
        systemShouldUseDarkColors: true,
      })
    ).toBe('light');

    expect(
      resolveStaticBootstrapThemeMode({
        theme: 'dark',
        terminalTheme: 'Dracula',
        systemShouldUseDarkColors: false,
      })
    ).toBe('dark');

    expect(
      resolveStaticBootstrapThemeMode({
        theme: 'system',
        terminalTheme: 'Dracula',
        systemShouldUseDarkColors: true,
      })
    ).toBe('dark');

    expect(
      resolveStaticBootstrapThemeMode({
        theme: 'system',
        terminalTheme: 'Dracula',
        systemShouldUseDarkColors: false,
      })
    ).toBe('light');
  });
});
