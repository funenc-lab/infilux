import { describe, expect, it } from 'vitest';

import {
  buildSessionDiagnosticsReport,
  collectLogIssuesFromContent,
  formatSessionDiagnosticsReport,
  parseCountRows,
} from '../session-diagnostics';

describe('session diagnostics', () => {
  it('computes database and tmux live-session differences', () => {
    const report = buildSessionDiagnosticsReport({
      stateCounts: [{ state: 'live', count: 2 }],
      dbLiveSessions: ['tmux:enso:enso-one', 'tmux:infilux:infilux-one'],
      tmuxLiveSessions: ['tmux:infilux:infilux-one', 'tmux:infilux:orphan-one'],
      missingHostSessions: [],
      logIssues: [],
      tmuxErrors: [],
      warnings: [],
    });

    expect(report.summary).toEqual({
      dbLiveCount: 2,
      tmuxLiveCount: 2,
      missingInTmuxCount: 1,
      orphanTmuxCount: 1,
      missingHostSessionCount: 0,
      logIssueCount: 0,
      warningCount: 0,
      healthy: false,
    });
    expect(report.missingInTmux).toEqual(['tmux:enso:enso-one']);
    expect(report.orphanTmux).toEqual(['tmux:infilux:orphan-one']);
  });

  it('formats a compact operational report with warnings and log issues', () => {
    const report = buildSessionDiagnosticsReport({
      stateCounts: [
        { state: 'live', count: 31 },
        { state: 'missing-host-session', count: 4 },
      ],
      dbLiveSessions: ['tmux:infilux:infilux-one'],
      tmuxLiveSessions: ['tmux:infilux:infilux-one'],
      missingHostSessions: [
        {
          hostSessionKey: 'infilux-missing',
          displayName: 'Codex',
          cwd: '/repo',
        },
      ],
      logIssues: [
        {
          filePath: '/logs/infilux.log',
          line: '[error] Failed to recover tmux server: infilux',
        },
      ],
      tmuxErrors: ['error connecting to tmux socket'],
      warnings: ['sqlite3 is unavailable'],
    });

    expect(formatSessionDiagnosticsReport(report)).toContain('DB live sessions: 1');
    expect(formatSessionDiagnosticsReport(report)).toContain('missing-host-session: 4');
    expect(formatSessionDiagnosticsReport(report)).toContain('infilux-missing');
    expect(formatSessionDiagnosticsReport(report)).toContain('Failed to recover tmux server');
    expect(formatSessionDiagnosticsReport(report)).toContain('sqlite3 is unavailable');
  });

  it('parses sqlite count rows emitted with pipe separators', () => {
    expect(parseCountRows('live|31\nmissing-host-session|4\n')).toEqual([
      { state: 'live', count: 31 },
      { state: 'missing-host-session', count: 4 },
    ]);
  });

  it('filters historical log issue matches outside the requested time window', () => {
    expect(
      collectLogIssuesFromContent({
        filePath: '/logs/infilux.log',
        content:
          '[2026-05-02 10:09:52.959] [error] Error: app-update.yml\n[2026-05-02 11:15:00.000] [error] Failed to recover tmux server: infilux\nmessage: target.hasAttribute is not a function\n',
        tailLines: 20,
        sinceEpochMs: new Date('2026-05-02T11:00:00').getTime(),
        limit: 20,
      })
    ).toEqual([
      {
        filePath: '/logs/infilux.log',
        line: '[2026-05-02 11:15:00.000] [error] Failed to recover tmux server: infilux',
      },
    ]);
  });
});
