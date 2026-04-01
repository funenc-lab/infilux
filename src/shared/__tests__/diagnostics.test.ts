import { describe, expect, it } from 'vitest';
import {
  buildDefaultDiagnosticsPaths,
  formatDiagnosticsArchivePath,
  formatDiagnosticsDirectoryName,
  listManagedLogFiles,
  sanitizeDiagnosticsLines,
  selectDiagnosticsLogFiles,
} from '../utils/diagnostics';

describe('shared diagnostics helpers', () => {
  it('builds default diagnostics paths for macOS', () => {
    const paths = buildDefaultDiagnosticsPaths({
      homeDir: '/Users/tester',
      platform: 'darwin',
      appName: 'Infilux',
    });

    expect(paths.sharedRoot).toBe('/Users/tester/.infilux');
    expect(paths.settingsPath).toBe('/Users/tester/.infilux/settings.json');
    expect(paths.sessionPath).toBe('/Users/tester/.infilux/session-state.json');
    expect(paths.logDirCandidates).toEqual([
      '/Users/tester/Library/Logs/Infilux',
      '/Users/tester/Library/Logs/infilux',
      '/Users/tester/.config/Infilux/logs',
      '/Users/tester/.config/infilux/logs',
    ]);
  });

  it('builds default diagnostics paths for Windows', () => {
    const paths = buildDefaultDiagnosticsPaths({
      homeDir: 'C:/Users/tester',
      platform: 'win32',
      appName: 'Infilux',
    });

    expect(paths.sharedRoot).toBe('C:/Users/tester/.infilux');
    expect(paths.logDirCandidates).toEqual([
      'C:/Users/tester/AppData/Roaming/Infilux/logs',
      'C:/Users/tester/AppData/Local/Infilux/logs',
      'C:/Users/tester/AppData/Roaming/infilux/logs',
      'C:/Users/tester/AppData/Local/infilux/logs',
    ]);
  });

  it('builds default diagnostics paths for Linux-style platforms', () => {
    const paths = buildDefaultDiagnosticsPaths({
      homeDir: '/home/tester',
      platform: 'linux',
      appName: 'Infilux',
    });

    expect(paths.sharedRoot).toBe('/home/tester/.infilux');
    expect(paths.logDirCandidates).toEqual([
      '/home/tester/.config/Infilux/logs',
      '/home/tester/.config/infilux/logs',
      '/home/tester/.cache/Infilux/logs',
      '/home/tester/.cache/infilux/logs',
    ]);
  });

  it('filters managed log files and sorts them newest-first', () => {
    expect(
      listManagedLogFiles(
        [
          'notes.txt',
          'infilux-2026-03-24.log',
          'infilux-2026-03-25.old.log',
          'infilux-2026-03-25.log',
        ],
        'infilux-'
      )
    ).toEqual(['infilux-2026-03-25.old.log', 'infilux-2026-03-25.log', 'infilux-2026-03-24.log']);
  });

  it('falls back to main.log when managed log files are unavailable', () => {
    expect(selectDiagnosticsLogFiles(['notes.txt', 'main.log'], 'infilux-')).toEqual(['main.log']);
  });

  it('prefers managed log files over main.log when both exist', () => {
    expect(
      selectDiagnosticsLogFiles(
        ['main.log', 'infilux-2026-03-25.log', 'infilux-2026-03-24.log'],
        'infilux-'
      )
    ).toEqual(['infilux-2026-03-25.log', 'infilux-2026-03-24.log']);
  });

  it('formats stable diagnostics output directory names', () => {
    expect(formatDiagnosticsDirectoryName(new Date('2026-03-26T04:05:06.000Z'))).toBe(
      'diagnostics-20260326-040506'
    );
  });

  it('redacts sensitive tokens from diagnostics lines', () => {
    expect(
      sanitizeDiagnosticsLines([
        'Authorization: Bearer secret-token-value',
        'access_token=abc123',
        '{"apiKey":"top-secret","password":"hunter2"}',
      ])
    ).toEqual([
      'Authorization: Bearer [REDACTED]',
      'access_token=[REDACTED]',
      '{"apiKey":"[REDACTED]","password":"[REDACTED]"}',
    ]);
  });

  it('builds a default diagnostics archive path next to the output directory', () => {
    expect(formatDiagnosticsArchivePath('/tmp/diagnostics/run-1')).toBe(
      '/tmp/diagnostics/run-1.tar.gz'
    );
    expect(
      formatDiagnosticsArchivePath('/tmp/diagnostics/run-1', '/tmp/archives/custom-bundle.tgz')
    ).toBe('/tmp/archives/custom-bundle.tgz');
  });
});
