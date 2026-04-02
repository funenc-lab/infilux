import { describe, expect, it } from 'vitest';

describe('bootstrap theme shared helpers', () => {
  it('extracts a bootstrap theme snapshot from persisted settings data', async () => {
    const { extractBootstrapThemeSnapshotFromSettingsData } = await import('../bootstrapTheme');

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

  it('round-trips a bootstrap theme snapshot through the additional argument format', async () => {
    const { encodeBootstrapThemeArgument, parseBootstrapThemeSnapshotFromArgv } = await import(
      '../bootstrapTheme'
    );

    const snapshot = {
      theme: 'system' as const,
      terminalTheme: 'Xcode WWDC',
      systemShouldUseDarkColors: true,
    };

    expect(
      parseBootstrapThemeSnapshotFromArgv(['electron', encodeBootstrapThemeArgument(snapshot)])
    ).toEqual(snapshot);
  });

  it('round-trips a bootstrap theme snapshot through the search parameter format', async () => {
    const { encodeBootstrapThemeSearchValue, parseBootstrapThemeSnapshotFromSearch } = await import(
      '../bootstrapTheme'
    );

    const snapshot = {
      theme: 'system' as const,
      terminalTheme: 'Xcode WWDC',
      systemShouldUseDarkColors: false,
    };

    expect(
      parseBootstrapThemeSnapshotFromSearch(
        `?infiluxBootstrapTheme=${encodeBootstrapThemeSearchValue(snapshot)}`
      )
    ).toEqual(snapshot);
  });

  it('resolves a static bootstrap mode only when terminal luminance is not required', async () => {
    const { resolveStaticBootstrapThemeMode } = await import('../bootstrapTheme');

    expect(
      resolveStaticBootstrapThemeMode({
        theme: 'light',
        terminalTheme: 'Dracula',
        systemShouldUseDarkColors: true,
      })
    ).toBe('light');

    expect(
      resolveStaticBootstrapThemeMode({
        theme: 'system',
        terminalTheme: 'Dracula',
        systemShouldUseDarkColors: true,
      })
    ).toBe('dark');

    expect(
      resolveStaticBootstrapThemeMode({
        theme: 'sync-terminal',
        terminalTheme: 'Dracula',
        systemShouldUseDarkColors: true,
      })
    ).toBeNull();
  });
});
