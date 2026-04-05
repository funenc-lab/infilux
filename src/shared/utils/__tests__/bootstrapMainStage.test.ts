import { describe, expect, it } from 'vitest';
import {
  encodeBootstrapMainStageArgument,
  parseBootstrapMainStageFromArgv,
} from '../bootstrapMainStage';

const BOOTSTRAP_MAIN_STAGE_ARGUMENT_PREFIX = '--infilux-bootstrap-main-stage=';

describe('bootstrap main stage shared helpers', () => {
  it('round-trips a bootstrap main stage through the additional argument format', () => {
    expect(
      parseBootstrapMainStageFromArgv([
        'electron',
        encodeBootstrapMainStageArgument('main-init-complete'),
      ])
    ).toBe('main-init-complete');
  });

  it('returns null for missing, unknown, and malformed bootstrap main stage arguments', () => {
    expect(parseBootstrapMainStageFromArgv(['electron'])).toBeNull();
    expect(
      parseBootstrapMainStageFromArgv([
        'electron',
        `${BOOTSTRAP_MAIN_STAGE_ARGUMENT_PREFIX}invalid`,
      ])
    ).toBeNull();
    expect(
      parseBootstrapMainStageFromArgv([
        'electron',
        `${BOOTSTRAP_MAIN_STAGE_ARGUMENT_PREFIX}invalid%ZZstage`,
      ])
    ).toBeNull();
  });
});
