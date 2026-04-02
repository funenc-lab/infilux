import { describe, expect, it } from 'vitest';
import { shouldShowSessionPersistenceNotice } from '../sessionPersistenceNoticePolicy';

describe('shouldShowSessionPersistenceNotice', () => {
  it('shows the notice for local unix repositories when tmux is installed but persistence is disabled', () => {
    expect(
      shouldShowSessionPersistenceNotice({
        isRemoteRepo: false,
        platform: 'darwin',
        tmuxEnabled: false,
        tmuxInstalled: true,
      })
    ).toBe(true);
  });

  it('hides the notice when persistence is already enabled', () => {
    expect(
      shouldShowSessionPersistenceNotice({
        isRemoteRepo: false,
        platform: 'darwin',
        tmuxEnabled: true,
        tmuxInstalled: true,
      })
    ).toBe(false);
  });

  it('hides the notice for windows, remote repositories, and missing tmux installs', () => {
    expect(
      shouldShowSessionPersistenceNotice({
        isRemoteRepo: false,
        platform: 'win32',
        tmuxEnabled: false,
        tmuxInstalled: true,
      })
    ).toBe(false);

    expect(
      shouldShowSessionPersistenceNotice({
        isRemoteRepo: true,
        platform: 'darwin',
        tmuxEnabled: false,
        tmuxInstalled: true,
      })
    ).toBe(false);

    expect(
      shouldShowSessionPersistenceNotice({
        isRemoteRepo: false,
        platform: 'linux',
        tmuxEnabled: false,
        tmuxInstalled: false,
      })
    ).toBe(false);
  });
});
