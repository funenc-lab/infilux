import { describe, expect, it } from 'vitest';
import { buildLogDiagnosticsModel } from '../logDiagnosticsModel';

describe('buildLogDiagnosticsModel', () => {
  const t = (key: string) => key;

  it('returns the active log path and joined tail output when diagnostics exist', () => {
    const model = buildLogDiagnosticsModel({
      status: 'ready',
      diagnostics: {
        path: '/tmp/logs/infilux-2026-03-26.log',
        lines: ['[info] boot complete', '[warn] sample warning'],
      },
      t,
    });

    expect(model.currentLogPath).toBe('/tmp/logs/infilux-2026-03-26.log');
    expect(model.output).toBe('[info] boot complete\n[warn] sample warning');
    expect(model.isLoading).toBe(false);
  });

  it('returns a stable empty-state copy when diagnostics are unavailable', () => {
    const model = buildLogDiagnosticsModel({
      status: 'error',
      diagnostics: {
        path: '',
        lines: [],
      },
      t,
    });

    expect(model.currentLogPath).toBe('Unavailable');
    expect(model.output).toBe('Log diagnostics unavailable');
    expect(model.isLoading).toBe(false);
  });
});
