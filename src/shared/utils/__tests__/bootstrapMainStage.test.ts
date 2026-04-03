import { describe, expect, it } from 'vitest';

describe('bootstrap main stage shared helpers', () => {
  it('round-trips a bootstrap main stage through the additional argument format', async () => {
    const { encodeBootstrapMainStageArgument, parseBootstrapMainStageFromArgv } = await import(
      '../bootstrapMainStage'
    );

    expect(
      parseBootstrapMainStageFromArgv([
        'electron',
        encodeBootstrapMainStageArgument('main-init-complete'),
      ])
    ).toBe('main-init-complete');
  });

  it('returns null for unknown bootstrap main stages', async () => {
    const { parseBootstrapMainStageFromArgv } = await import('../bootstrapMainStage');

    expect(
      parseBootstrapMainStageFromArgv(['electron', '--infilux-bootstrap-main-stage=invalid'])
    ).toBeNull();
  });
});
