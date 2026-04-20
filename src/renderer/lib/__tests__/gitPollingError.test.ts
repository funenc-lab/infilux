import { describe, expect, it } from 'vitest';

import {
  classifyGitPollingError,
  resolveGitPollingInterval,
  shouldRetryGitPollingError,
  shouldStopGitPolling,
} from '../gitPollingError';

describe('gitPollingError', () => {
  it('classifies invalid workdir failures as permanent', () => {
    expect(
      classifyGitPollingError(
        new Error('Invalid workdir: path does not exist or is not a directory')
      )
    ).toBe('invalid-workdir');
    expect(
      shouldStopGitPolling(new Error('Invalid workdir: path does not exist or is not a directory'))
    ).toBe(true);
  });

  it('classifies not-a-repository failures as permanent', () => {
    expect(classifyGitPollingError(new Error('Invalid workdir: not a git repository'))).toBe(
      'not-git-repository'
    );
    expect(shouldStopGitPolling(new Error('Invalid workdir: not a git repository'))).toBe(true);
  });

  it('classifies bad file descriptor failures as restart-required and limits retries to transient failures', () => {
    expect(classifyGitPollingError(new Error('spawn EBADF'))).toBe('runtime-restart-required');
    expect(classifyGitPollingError(new Error('spawn EAGAIN'))).toBe('transient');
    expect(shouldRetryGitPollingError(0, new Error('spawn EBADF'))).toBe(false);
    expect(shouldRetryGitPollingError(0, new Error('spawn EAGAIN'))).toBe(true);
    expect(shouldRetryGitPollingError(2, new Error('spawn EAGAIN'))).toBe(false);
    expect(shouldStopGitPolling(new Error('spawn EBADF'))).toBe(true);
  });

  it('resolves polling intervals from the current error class', () => {
    expect(
      resolveGitPollingInterval(
        new Error('Invalid workdir: path does not exist or is not a directory'),
        5000,
        30000
      )
    ).toBe(false);
    expect(resolveGitPollingInterval(new Error('spawn EBADF'), 5000, 30000)).toBe(false);
    expect(resolveGitPollingInterval(new Error('spawn EAGAIN'), 5000, 30000)).toBe(30000);
    expect(resolveGitPollingInterval(null, 5000, 30000)).toBe(5000);
  });
});
