import { describe, expect, it } from 'vitest';
import {
  buildSessionPersistenceNoticeDismissKey,
  resolveSessionPersistenceNoticeKind,
  shouldShowSessionPersistenceNotice,
} from '../sessionPersistenceNoticePolicy';

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
    expect(
      resolveSessionPersistenceNoticeKind({
        isRemoteRepo: false,
        platform: 'darwin',
        tmuxEnabled: false,
        tmuxInstalled: true,
      })
    ).toBe('tmux-disabled');
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
    expect(
      resolveSessionPersistenceNoticeKind({
        isRemoteRepo: false,
        platform: 'darwin',
        tmuxEnabled: true,
        tmuxInstalled: true,
      })
    ).toBeNull();
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
    expect(
      resolveSessionPersistenceNoticeKind({
        isRemoteRepo: false,
        platform: 'linux',
        tmuxEnabled: false,
        tmuxInstalled: false,
      })
    ).toBeNull();
  });

  it('prioritizes recovery-required notices for local worktrees with unrecoverable sessions', () => {
    expect(
      resolveSessionPersistenceNoticeKind({
        isRemoteRepo: false,
        platform: 'darwin',
        tmuxEnabled: false,
        tmuxInstalled: true,
        hasRecoveryRequiredSession: true,
      })
    ).toBe('recovery-required');
    expect(
      shouldShowSessionPersistenceNotice({
        isRemoteRepo: false,
        platform: 'darwin',
        tmuxEnabled: false,
        tmuxInstalled: true,
        hasRecoveryRequiredSession: true,
      })
    ).toBe(true);
  });

  it('builds stable dismiss keys scoped by worktree and unrecoverable sessions', () => {
    expect(
      buildSessionPersistenceNoticeDismissKey({
        kind: 'tmux-disabled',
        repoPath: '/repo',
        worktreePath: '/repo/feature',
      })
    ).toBe('tmux-disabled:/repo::/repo/feature');

    expect(
      buildSessionPersistenceNoticeDismissKey({
        kind: 'recovery-required',
        repoPath: '/repo',
        worktreePath: '/repo/feature',
        recoveryRequiredSessionIds: ['session-b', 'session-a', 'session-a'],
      })
    ).toBe('recovery-required:/repo::/repo/feature:session-a,session-b');
  });

  it('does not build a dismiss key when the active notice scope is incomplete', () => {
    expect(
      buildSessionPersistenceNoticeDismissKey({
        kind: null,
        repoPath: '/repo',
        worktreePath: '/repo/feature',
      })
    ).toBeNull();

    expect(
      buildSessionPersistenceNoticeDismissKey({
        kind: 'recovery-required',
        repoPath: '/repo',
        worktreePath: '/repo/feature',
        recoveryRequiredSessionIds: [],
      })
    ).toBeNull();
  });
});
