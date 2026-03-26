import { describe, expect, it } from 'vitest';
import {
  buildChatInputToastCopy,
  buildChatNotificationCopy,
  buildClipboardToastCopy,
  buildFileWorkflowToastCopy,
  buildOperationToastCopy,
  buildRemoteSettingsFeedbackCopy,
  buildRemoteSettingsSurfaceCopy,
  buildRemovalDialogCopy,
  buildSettingsWorkflowToastCopy,
  buildSourceControlToastCopy,
  buildSourceControlWorkflowToastCopy,
  buildWorkspaceToastCopy,
} from '../feedbackCopy';

const t = (key: string, params?: Record<string, string | number>) =>
  key.replace(/\{\{(\w+)\}\}/g, (_, token: string) => String(params?.[token] ?? `{{${token}}}`));

describe('buildRemovalDialogCopy', () => {
  it('returns explicit repository removal copy', () => {
    expect(buildRemovalDialogCopy({ kind: 'repository', name: 'EnsoAI' }, t)).toEqual({
      title: 'Remove repository',
      description: 'EnsoAI will be removed from the workspace.',
      consequence: 'Local files will not be deleted.',
      actionLabel: 'Remove repository',
    });
  });

  it('returns irreversible worktree deletion copy for live directories', () => {
    expect(
      buildRemovalDialogCopy({ kind: 'worktree', name: 'feature/console-copy', prunable: false }, t)
    ).toEqual({
      title: 'Delete Worktree',
      description: 'Worktree feature/console-copy and its directory will be deleted.',
      consequence: 'This action cannot be undone.',
      actionLabel: 'Delete worktree',
    });
  });

  it('returns record-cleanup copy for prunable worktrees', () => {
    expect(
      buildRemovalDialogCopy({ kind: 'worktree', name: 'feature/pruned', prunable: true }, t)
    ).toEqual({
      title: 'Delete Worktree',
      description: 'Worktree feature/pruned records will be removed from Git.',
      consequence: 'The directory has already been removed.',
      actionLabel: 'Delete worktree',
    });
  });

  it('returns irreversible temp-session removal copy', () => {
    expect(buildRemovalDialogCopy({ kind: 'temp-session', name: 'Scratch Pad' }, t)).toEqual({
      title: 'Delete temp session',
      description: 'Scratch Pad and its directory will be deleted.',
      consequence: 'This action cannot be undone.',
      actionLabel: 'Delete temp session',
    });
  });
});

describe('buildOperationToastCopy', () => {
  it('returns explicit temp-session toast copy across phases', () => {
    expect(
      buildOperationToastCopy(
        { phase: 'loading', kind: 'temp-session', action: 'create', label: 'Scratch Pad' },
        t
      )
    ).toEqual({
      title: 'Creating temp session',
      description: 'Scratch Pad',
    });

    expect(
      buildOperationToastCopy(
        { phase: 'loading', kind: 'temp-session', action: 'delete', label: 'Scratch Pad' },
        t
      )
    ).toEqual({
      title: 'Deleting temp session',
      description: 'Scratch Pad',
    });

    expect(
      buildOperationToastCopy(
        { phase: 'success', kind: 'temp-session', action: 'create', label: 'Scratch Pad' },
        t
      )
    ).toEqual({
      title: 'Temp Session created',
      description: 'Scratch Pad',
    });

    expect(
      buildOperationToastCopy(
        { phase: 'success', kind: 'temp-session', action: 'delete', label: 'Scratch Pad' },
        t
      )
    ).toEqual({
      title: 'Temp Session deleted',
      description: 'Scratch Pad',
    });

    expect(
      buildOperationToastCopy(
        {
          phase: 'error',
          kind: 'temp-session',
          action: 'create',
          message: 'Checkout failed',
        },
        t
      )
    ).toEqual({
      title: 'Failed to create temp session',
      description: 'Checkout failed',
    });

    expect(
      buildOperationToastCopy(
        {
          phase: 'error',
          kind: 'temp-session',
          action: 'delete',
          message: 'Permission denied',
        },
        t
      )
    ).toEqual({
      title: 'Failed to delete temp session',
      description: 'Permission denied',
    });
  });

  it('returns explicit worktree deletion toast copy', () => {
    expect(
      buildOperationToastCopy(
        {
          phase: 'loading',
          kind: 'worktree',
          action: 'delete',
          label: 'feature/console-copy',
        },
        t
      )
    ).toEqual({
      title: 'Deleting worktree',
      description: 'feature/console-copy',
    });

    expect(
      buildOperationToastCopy(
        {
          phase: 'success',
          kind: 'worktree',
          action: 'delete',
          label: 'feature/console-copy',
        },
        t
      )
    ).toEqual({
      title: 'Worktree deleted',
      description: 'feature/console-copy',
    });

    expect(
      buildOperationToastCopy(
        {
          phase: 'error',
          kind: 'worktree',
          action: 'delete',
          message: 'Directory is not empty',
        },
        t
      )
    ).toEqual({
      title: 'Failed to delete worktree',
      description: 'Directory is not empty',
    });
  });
});

describe('buildFileWorkflowToastCopy', () => {
  it('returns send-to-session and file error copy', () => {
    expect(
      buildFileWorkflowToastCopy(
        { action: 'send-to-session', phase: 'success', target: '@src/App.tsx' },
        t
      )
    ).toEqual({
      title: 'Sent to session',
      description: '@src/App.tsx',
    });

    expect(buildFileWorkflowToastCopy({ action: 'file-save', phase: 'error' }, t)).toEqual({
      title: 'Save failed',
      description: 'Unknown error',
    });

    expect(
      buildFileWorkflowToastCopy(
        { action: 'file-save', phase: 'error', message: 'Permission denied' },
        t
      )
    ).toEqual({
      title: 'Save failed',
      description: 'Permission denied',
    });

    expect(buildFileWorkflowToastCopy({ action: 'file-read', phase: 'error' }, t)).toEqual({
      title: 'File read failed',
      description: 'Unknown error',
    });

    expect(
      buildFileWorkflowToastCopy(
        { action: 'file-read', phase: 'error', message: 'File missing on disk' },
        t
      )
    ).toEqual({
      title: 'File read failed',
      description: 'File missing on disk',
    });
  });

  it('returns file transfer success and failure copy', () => {
    expect(
      buildFileWorkflowToastCopy(
        { action: 'file-transfer', phase: 'success', operation: 'copy', count: 3 },
        t
      )
    ).toEqual({
      title: 'Copy completed',
      description: '3 file(s) successful',
    });

    expect(
      buildFileWorkflowToastCopy(
        { action: 'file-transfer', phase: 'success', operation: 'move', count: 2 },
        t
      )
    ).toEqual({
      title: 'Move completed',
      description: '2 file(s) successful',
    });

    expect(
      buildFileWorkflowToastCopy({ action: 'file-transfer', phase: 'error', count: 1 }, t)
    ).toEqual({
      title: 'Operation failed',
      description: '1 file(s) failed',
    });
  });
});

describe('buildChatInputToastCopy', () => {
  it('returns message and image error copy', () => {
    expect(buildChatInputToastCopy({ action: 'message-send', phase: 'error' }, t)).toEqual({
      title: 'Failed to send message',
      description: 'Unknown error',
    });

    expect(
      buildChatInputToastCopy(
        { action: 'image-save', phase: 'error', message: 'Temp directory unavailable' },
        t
      )
    ).toEqual({
      title: 'Failed to save image',
      description: 'Temp directory unavailable',
    });
  });

  it('returns image warning copy', () => {
    expect(
      buildChatInputToastCopy({ action: 'image-size', phase: 'warning', sizeMb: 10 }, t)
    ).toEqual({
      title: 'Image too large',
      description: 'Max image size is 10MB',
    });

    expect(
      buildChatInputToastCopy({ action: 'image-count', phase: 'warning', count: 5 }, t)
    ).toEqual({
      title: 'Too many images',
      description: 'Max images is 5',
    });
  });
});

describe('buildChatNotificationCopy', () => {
  it('returns command completion notification copy', () => {
    expect(
      buildChatNotificationCopy(
        { action: 'command-completed', command: 'claude', body: 'my-project' },
        t
      )
    ).toEqual({
      title: 'claude completed',
      body: 'my-project',
    });
  });

  it('returns waiting input notification copy', () => {
    expect(
      buildChatNotificationCopy(
        { action: 'waiting-input', command: 'Codex', preview: 'Choose a deploy target' },
        t
      )
    ).toEqual({
      title: 'Codex waiting for input',
      body: 'Choose a deploy target',
    });

    expect(buildChatNotificationCopy({ action: 'waiting-input', command: 'Codex' }, t)).toEqual({
      title: 'Codex waiting for input',
      body: 'User response required',
    });
  });
});

describe('buildWorkspaceToastCopy', () => {
  it('returns repository visibility toast copy', () => {
    expect(buildWorkspaceToastCopy({ action: 'repository-hide', phase: 'success' }, t)).toEqual({
      title: 'Repository hidden',
      description: 'Hidden repositories will not appear in the sidebar',
    });
  });
});

describe('buildClipboardToastCopy', () => {
  it('returns subject-specific clipboard success copy', () => {
    expect(buildClipboardToastCopy({ phase: 'success', subject: 'commit-id' }, t)).toEqual({
      title: 'Copied',
      description: 'Commit ID copied to clipboard',
    });

    expect(buildClipboardToastCopy({ phase: 'success', subject: 'path' }, t)).toEqual({
      title: 'Copied',
      description: 'Path copied to clipboard',
    });

    expect(buildClipboardToastCopy({ phase: 'success', subject: 'relative-path' }, t)).toEqual({
      title: 'Copied',
      description: 'Relative path copied to clipboard',
    });

    expect(buildClipboardToastCopy({ phase: 'success', subject: 'review' }, t)).toEqual({
      title: 'Copied',
      description: 'Review content copied to clipboard',
    });
  });

  it('returns fallback clipboard error copy', () => {
    expect(buildClipboardToastCopy({ phase: 'error', subject: 'review' }, t)).toEqual({
      title: 'Copy failed',
      description: 'Failed to copy content',
    });

    expect(
      buildClipboardToastCopy(
        { phase: 'error', subject: 'commit-id', message: 'Clipboard unavailable' },
        t
      )
    ).toEqual({
      title: 'Copy failed',
      description: 'Clipboard unavailable',
    });
  });
});

describe('buildSourceControlToastCopy', () => {
  it('returns consistent success copy for revert and reset', () => {
    expect(buildSourceControlToastCopy({ action: 'revert', phase: 'success' }, t)).toEqual({
      title: 'Revert successful',
      description: 'Commit has been reverted',
    });

    expect(
      buildSourceControlToastCopy({ action: 'reset', phase: 'success', mode: 'Hard Reset' }, t)
    ).toEqual({
      title: 'Reset successful',
      description: 'Reset to Hard Reset mode',
    });
  });

  it('returns consistent error copy for git operations', () => {
    expect(buildSourceControlToastCopy({ action: 'revert', phase: 'error' }, t)).toEqual({
      title: 'Revert failed',
      description: 'Unknown error',
    });

    expect(
      buildSourceControlToastCopy(
        { action: 'reset', phase: 'error', message: 'Working tree is dirty' },
        t
      )
    ).toEqual({
      title: 'Reset failed',
      description: 'Working tree is dirty',
    });

    expect(
      buildSourceControlToastCopy(
        { action: 'discard', phase: 'error', message: 'Permission denied' },
        t
      )
    ).toEqual({
      title: 'Discard failed',
      description: 'Permission denied',
    });

    expect(buildSourceControlToastCopy({ action: 'commit', phase: 'error' }, t)).toEqual({
      title: 'Commit failed',
      description: 'Unknown error',
    });

    expect(buildSourceControlToastCopy({ action: 'stage', phase: 'error' }, t)).toEqual({
      title: 'Stage failed',
      description: 'Unknown error',
    });

    expect(
      buildSourceControlToastCopy(
        { action: 'unstage', phase: 'error', message: 'Index lock held' },
        t
      )
    ).toEqual({
      title: 'Unstage failed',
      description: 'Index lock held',
    });
  });
});

describe('buildSourceControlWorkflowToastCopy', () => {
  it('returns sync toast copy for mixed pull and push results', () => {
    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'sync', phase: 'success', branch: 'main', pulled: 2, pushed: 3 },
        t
      )
    ).toEqual({
      title: 'Sync completed',
      description: 'Pulled 2 commit(s), pushed 3 commit(s) on main',
    });
  });

  it('returns sync toast copy for pull-only, push-only, idle, and error states', () => {
    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'sync', phase: 'success', branch: 'main', pulled: 2, pushed: 0 },
        t
      )
    ).toEqual({
      title: 'Sync completed',
      description: 'Pulled 2 commit(s) on main',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'sync', phase: 'success', branch: 'main', pulled: 0, pushed: 3 },
        t
      )
    ).toEqual({
      title: 'Sync completed',
      description: 'Pushed 3 commit(s) on main',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'sync', phase: 'success', branch: 'main', pulled: 0, pushed: 0 },
        t
      )
    ).toEqual({
      title: 'Already up to date',
      description: 'main is in sync with remote',
    });

    expect(buildSourceControlWorkflowToastCopy({ action: 'sync', phase: 'error' }, t)).toEqual({
      title: 'Sync failed',
      description: 'Unknown error',
    });
  });

  it('returns branch and commit workflow copy', () => {
    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'publish', phase: 'success', branch: 'feature/x' },
        t
      )
    ).toEqual({
      title: 'Branch published',
      description: 'Branch feature/x is now tracking origin/feature/x',
    });

    expect(
      buildSourceControlWorkflowToastCopy({ action: 'commit', phase: 'success', count: 4 }, t)
    ).toEqual({
      title: 'Commit successful',
      description: 'Committed 4 files',
    });
  });

  it('returns branch and workflow error copy', () => {
    expect(buildSourceControlWorkflowToastCopy({ action: 'publish', phase: 'error' }, t)).toEqual({
      title: 'Publish failed',
      description: 'Unknown error',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'branch-switch', phase: 'success', branch: 'feature/x' },
        t
      )
    ).toEqual({
      title: 'Branch switched',
      description: 'Branch switched to feature/x',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'branch-switch', phase: 'error', message: 'Branch missing' },
        t
      )
    ).toEqual({
      title: 'Failed to switch branch',
      description: 'Branch missing',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'branch-create', phase: 'success', branch: 'feature/y' },
        t
      )
    ).toEqual({
      title: 'Branch created',
      description: 'Branch switched to feature/y',
    });

    expect(
      buildSourceControlWorkflowToastCopy({ action: 'branch-create', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to create branch',
      description: 'Unknown error',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'commit', phase: 'error', message: 'Nothing to commit' },
        t
      )
    ).toEqual({
      title: 'Commit failed',
      description: 'Nothing to commit',
    });
  });

  it('returns file and generator error copy', () => {
    expect(
      buildSourceControlWorkflowToastCopy({ action: 'file-save', phase: 'success' }, t)
    ).toEqual({
      title: 'File saved',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'file-save', phase: 'error', message: 'Permission denied' },
        t
      )
    ).toEqual({
      title: 'Failed to save file',
      description: 'Permission denied',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        { action: 'commit-message', phase: 'error', message: 'Generation timed out' },
        t
      )
    ).toEqual({
      title: 'Failed to generate commit message',
      description: 'Generation timed out',
    });

    expect(
      buildSourceControlWorkflowToastCopy({ action: 'commit-message', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to generate commit message',
      description: 'Unknown error',
    });
  });

  it('returns merge stash and warning workflow copy', () => {
    expect(
      buildSourceControlWorkflowToastCopy(
        {
          action: 'merge-stash',
          phase: 'success',
          paths: ['/repo/main', '/repo/feature-x'],
        },
        t
      )
    ).toEqual({
      title: 'Changes stashed',
      description:
        'Your uncommitted changes were stashed. After resolving conflicts, run "git stash pop" in:\n/repo/main\n/repo/feature-x',
    });

    expect(
      buildSourceControlWorkflowToastCopy(
        {
          action: 'merge-warning',
          phase: 'success',
          warnings: ['Branch cleanup skipped', 'Manual review required'],
        },
        t
      )
    ).toEqual({
      title: 'Merge completed with warnings',
      description: 'Branch cleanup skipped\nManual review required',
    });
  });
});

describe('buildSettingsWorkflowToastCopy', () => {
  it('returns CLI install and uninstall copy', () => {
    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'cli-install', phase: 'success', path: '/usr/local/bin/infilux' },
        t
      )
    ).toEqual({
      title: 'CLI install success',
      description: "'infilux' command installed to /usr/local/bin/infilux",
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'cli-uninstall', phase: 'success' }, t)
    ).toEqual({
      title: 'CLI uninstall success',
      description: "'infilux' command uninstalled",
    });

    expect(buildSettingsWorkflowToastCopy({ action: 'cli-install', phase: 'success' }, t)).toEqual({
      title: 'CLI install success',
      description: "'infilux' command installed to ",
    });
  });

  it('returns provider switch and CLI error copy', () => {
    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'provider-switch', phase: 'success', name: 'Claude Max' },
        t
      )
    ).toEqual({
      title: 'Provider switched',
      description: 'Claude Max',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'provider-switch', phase: 'error' }, t)
    ).toEqual({
      title: 'Switch failed',
      description: 'Unknown error',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'provider-switch', phase: 'error', message: 'Provider file is locked' },
        t
      )
    ).toEqual({
      title: 'Switch failed',
      description: 'Provider file is locked',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'provider-detected', phase: 'info' }, t)
    ).toEqual({
      title: 'New provider detected',
      description: 'Click to save this config',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'cli-install', phase: 'error', message: 'Permission denied' },
        t
      )
    ).toEqual({
      title: 'CLI install failed',
      description: 'Permission denied',
    });

    expect(buildSettingsWorkflowToastCopy({ action: 'cli-uninstall', phase: 'error' }, t)).toEqual({
      title: 'CLI uninstall failed',
      description: 'Unknown error',
    });
  });

  it('returns plugin, marketplace, prompt, and mcp settings copy', () => {
    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'plugin-install', phase: 'success', id: 'spellcheck@official' },
        t
      )
    ).toEqual({
      title: 'Plugin installed',
      description: 'spellcheck@official',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'plugin-uninstall', phase: 'success', id: 'spellcheck@official' },
        t
      )
    ).toEqual({
      title: 'Plugin uninstalled',
      description: 'spellcheck@official',
    });

    expect(buildSettingsWorkflowToastCopy({ action: 'plugin-install', phase: 'error' }, t)).toEqual(
      {
        title: 'Failed to install plugin',
        description: 'Unknown error',
      }
    );

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'plugin-uninstall', phase: 'error', message: 'Busy plugin' },
        t
      )
    ).toEqual({
      title: 'Failed to uninstall plugin',
      description: 'Busy plugin',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'plugin-uninstall', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to uninstall plugin',
      description: 'Unknown error',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'marketplace-add', phase: 'success', repo: 'owner/repo' },
        t
      )
    ).toEqual({
      title: 'Marketplace added',
      description: 'owner/repo',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'marketplace-add', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to add marketplace',
      description: 'Unknown error',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'marketplace-exists', phase: 'error', repo: 'owner/repo' },
        t
      )
    ).toEqual({
      title: 'Marketplace already exists',
      description: 'owner/repo',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'marketplace-remove', phase: 'success', name: 'Official Repo' },
        t
      )
    ).toEqual({
      title: 'Marketplace removed',
      description: 'Official Repo',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'marketplace-remove', phase: 'error', message: 'In use' },
        t
      )
    ).toEqual({
      title: 'Failed to remove marketplace',
      description: 'In use',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'marketplace-remove', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to remove marketplace',
      description: 'Unknown error',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'marketplace-refresh', phase: 'success' }, t)
    ).toEqual({
      title: 'Marketplaces updated',
      description: 'Plugin Marketplaces',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'marketplace-refresh', phase: 'error', message: 'Network down' },
        t
      )
    ).toEqual({
      title: 'Failed to update marketplaces',
      description: 'Network down',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'marketplace-refresh', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to update marketplaces',
      description: 'Unknown error',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'prompt-remove', phase: 'success' }, t)
    ).toEqual({
      title: 'Prompt preset removed',
      description: undefined,
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'prompt-activate', phase: 'success', name: 'Default Team Prompt' },
        t
      )
    ).toEqual({
      title: 'Prompt activated',
      description: 'Default Team Prompt',
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'prompt-activate', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to activate prompt',
      description: 'Unknown error',
    });

    expect(
      buildSettingsWorkflowToastCopy(
        { action: 'prompt-save', phase: 'success', name: 'Default Team Prompt' },
        t
      )
    ).toEqual({
      title: 'Prompt saved',
      description: 'Default Team Prompt',
    });

    expect(buildSettingsWorkflowToastCopy({ action: 'mcp-save', phase: 'success' }, t)).toEqual({
      title: 'MCP server saved',
      description: undefined,
    });

    expect(
      buildSettingsWorkflowToastCopy({ action: 'mcp-remove', phase: 'success', name: 'Docs' }, t)
    ).toEqual({
      title: 'MCP server removed',
      description: 'Docs',
    });
  });
});

describe('buildRemoteSettingsFeedbackCopy', () => {
  it('returns validation and profile workflow copy', () => {
    expect(buildRemoteSettingsFeedbackCopy({ action: 'profile-name', phase: 'error' }, t)).toEqual({
      title: 'Profile name is required',
      description: 'Give this connection a short recognizable name.',
    });

    expect(buildRemoteSettingsFeedbackCopy({ action: 'ssh-target', phase: 'error' }, t)).toEqual({
      title: 'SSH target is required',
      description: 'Use the same target you would pass to ssh, for example user@example.com.',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'profile-save', phase: 'success' }, t)
    ).toEqual({
      title: 'Remote profile saved',
      description: 'You can now use it from the Remote Host entry in the sidebar.',
    });

    expect(
      buildRemoteSettingsFeedbackCopy(
        { action: 'profile-save', phase: 'error', message: 'Write failed' },
        t
      )
    ).toEqual({
      title: 'Failed to save remote profile',
      description: 'Write failed',
    });

    expect(
      buildRemoteSettingsFeedbackCopy(
        { action: 'profile-delete', phase: 'error', message: 'Permission denied' },
        t
      )
    ).toEqual({
      title: 'Failed to delete remote profile',
      description: 'Permission denied',
    });
  });

  it('returns the remaining profile delete and runtime install branches', () => {
    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'profile-delete', phase: 'success' }, t)
    ).toEqual({
      title: 'Remote profile deleted',
      description: 'The saved SSH connection has been removed.',
    });

    expect(
      buildRemoteSettingsFeedbackCopy(
        { action: 'runtime-install', phase: 'error', message: 'Install script failed' },
        t
      )
    ).toEqual({
      title: 'Failed to install runtime',
      description: 'Install script failed',
    });
  });

  it('returns connection test and runtime workflow copy', () => {
    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'profile-incomplete', phase: 'error' }, t)
    ).toEqual({
      title: 'Profile is incomplete',
      description: 'Fill in the profile name and SSH target before testing the connection.',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'connection-test', phase: 'success' }, t)
    ).toEqual({
      title: 'Connection succeeded',
      description: 'The remote host is reachable and ready for managed runtime setup.',
    });

    expect(
      buildRemoteSettingsFeedbackCopy(
        { action: 'connection-test', phase: 'error', message: 'Handshake failed' },
        t
      )
    ).toEqual({
      title: 'Connection failed',
      description: 'Handshake failed',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'runtime-install', phase: 'success' }, t)
    ).toEqual({
      title: 'Runtime installed',
      description: 'The managed remote runtime is now installed on this host.',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'runtime-update', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to update runtime',
      description: 'Unknown error',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'runtime-delete', phase: 'success' }, t)
    ).toEqual({
      title: 'Runtime deleted',
      description: 'All installed managed runtime versions for this profile were removed.',
    });
  });

  it('returns the remaining runtime update and delete branches', () => {
    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'runtime-update', phase: 'success' }, t)
    ).toEqual({
      title: 'Runtime updated',
      description: 'The managed remote runtime was reinstalled successfully.',
    });

    expect(
      buildRemoteSettingsFeedbackCopy(
        { action: 'runtime-delete', phase: 'error', message: 'Runtime busy' },
        t
      )
    ).toEqual({
      title: 'Failed to delete runtime',
      description: 'Runtime busy',
    });
  });

  it('falls back to unknown-error copy for remaining runtime error branches without a message', () => {
    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'connection-test', phase: 'error' }, t)
    ).toEqual({
      title: 'Connection failed',
      description: 'Unknown error',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'runtime-install', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to install runtime',
      description: 'Unknown error',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'runtime-delete', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to delete runtime',
      description: 'Unknown error',
    });
  });

  it('returns infrastructure load and refresh error copy', () => {
    expect(
      buildRemoteSettingsFeedbackCopy(
        { action: 'profiles-load', phase: 'error', message: 'Config unreadable' },
        t
      )
    ).toEqual({
      title: 'Failed to load remote profiles',
      description: 'Config unreadable',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'runtime-status', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to refresh runtime status',
      description: 'Unknown error',
    });
  });

  it('falls back to unknown-error copy for remaining profile workflow errors without a message', () => {
    expect(buildRemoteSettingsFeedbackCopy({ action: 'profiles-load', phase: 'error' }, t)).toEqual(
      {
        title: 'Failed to load remote profiles',
        description: 'Unknown error',
      }
    );

    expect(buildRemoteSettingsFeedbackCopy({ action: 'profile-save', phase: 'error' }, t)).toEqual({
      title: 'Failed to save remote profile',
      description: 'Unknown error',
    });

    expect(
      buildRemoteSettingsFeedbackCopy({ action: 'profile-delete', phase: 'error' }, t)
    ).toEqual({
      title: 'Failed to delete remote profile',
      description: 'Unknown error',
    });
  });

  it('falls back to unknown-error copy for runtime status surface errors without a message', () => {
    expect(buildRemoteSettingsSurfaceCopy({ action: 'runtime-status-error' }, t)).toEqual({
      title: 'Failed to refresh runtime status',
      description: 'Unknown error',
    });
  });
});

describe('buildRemoteSettingsSurfaceCopy', () => {
  it('returns runtime guidance and status surface copy', () => {
    expect(buildRemoteSettingsSurfaceCopy({ action: 'runtime-select-profile' }, t)).toEqual({
      title: 'Select a profile',
      description: 'Choose a saved SSH profile above before managing the remote runtime.',
    });

    expect(
      buildRemoteSettingsSurfaceCopy({ action: 'runtime-status-error', message: 'Host offline' }, t)
    ).toEqual({
      title: 'Failed to refresh runtime status',
      description: 'Host offline',
    });

    expect(buildRemoteSettingsSurfaceCopy({ action: 'runtime-status-summary' }, t)).toEqual({
      title: 'Runtime status',
      description: '',
    });

    expect(buildRemoteSettingsSurfaceCopy({ action: 'remote-environment' }, t)).toEqual({
      title: 'Remote environment',
      description: '',
    });
  });

  it('returns runtime delete dialog copy', () => {
    expect(buildRemoteSettingsSurfaceCopy({ action: 'runtime-delete-dialog' }, t)).toEqual({
      title: 'Delete managed remote runtime?',
      description: 'This will remove all installed managed runtime versions for this SSH profile.',
    });
  });
});
