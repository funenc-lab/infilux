import type { TFunction } from '@/i18n';

export interface RemovalDialogCopy {
  title: string;
  description: string;
  consequence: string;
  actionLabel: string;
}

type ClipboardToastInput =
  | { phase: 'success'; subject: 'commit-id' | 'review' | 'path' | 'relative-path' }
  | {
      phase: 'error';
      subject: 'commit-id' | 'review' | 'path' | 'relative-path';
      message?: string;
    };

type RemovalTarget =
  | { kind: 'repository'; name: string }
  | { kind: 'temp-session'; name: string }
  | { kind: 'worktree'; name: string; prunable: boolean };

type OperationToastInput =
  | {
      phase: 'loading' | 'success' | 'error';
      kind: 'temp-session';
      action: 'create' | 'delete';
      label?: string;
      message?: string;
    }
  | {
      phase: 'loading' | 'success' | 'error';
      kind: 'worktree';
      action: 'delete';
      label?: string;
      message?: string;
    };

type FileWorkflowToastInput =
  | { action: 'send-to-session'; phase: 'success'; target: string }
  | { action: 'file-save'; phase: 'error'; message?: string }
  | { action: 'file-read'; phase: 'error'; message?: string }
  | { action: 'file-transfer'; phase: 'success'; operation: 'copy' | 'move'; count: number }
  | { action: 'file-transfer'; phase: 'error'; count: number };

type ChatInputToastInput =
  | { action: 'message-send'; phase: 'error'; message?: string }
  | { action: 'image-size'; phase: 'warning'; sizeMb: number }
  | { action: 'image-save'; phase: 'error'; message?: string }
  | { action: 'image-count'; phase: 'warning'; count: number };

type ChatNotificationInput =
  | { action: 'command-completed'; command: string; body: string }
  | { action: 'waiting-input'; command: string; preview?: string };

type WorkspaceToastInput = { action: 'repository-hide'; phase: 'success' };

type SourceControlToastInput =
  | { action: 'revert'; phase: 'success' }
  | { action: 'revert'; phase: 'error'; message?: string }
  | { action: 'reset'; phase: 'success'; mode: string }
  | { action: 'reset'; phase: 'error'; message?: string }
  | { action: 'stage' | 'unstage' | 'discard' | 'commit'; phase: 'error'; message?: string };

type SourceControlWorkflowToastInput =
  | { action: 'sync'; phase: 'success'; branch: string; pulled: number; pushed: number }
  | { action: 'sync'; phase: 'error'; message?: string }
  | { action: 'publish'; phase: 'success'; branch: string }
  | { action: 'publish'; phase: 'error'; message?: string }
  | { action: 'branch-switch'; phase: 'success'; branch: string }
  | { action: 'branch-switch'; phase: 'error'; message?: string }
  | { action: 'branch-create'; phase: 'success'; branch: string }
  | { action: 'branch-create'; phase: 'error'; message?: string }
  | { action: 'commit'; phase: 'success'; count: number }
  | { action: 'commit'; phase: 'error'; message?: string }
  | { action: 'file-save'; phase: 'success' }
  | { action: 'file-save'; phase: 'error'; message?: string }
  | { action: 'commit-message'; phase: 'error'; message?: string }
  | { action: 'merge-stash'; phase: 'success'; paths: string[] }
  | { action: 'merge-warning'; phase: 'success'; warnings: string[] };

type SettingsWorkflowToastInput =
  | { action: 'cli-install'; phase: 'success'; path?: string }
  | { action: 'cli-install'; phase: 'error'; message?: string }
  | { action: 'cli-uninstall'; phase: 'success' }
  | { action: 'cli-uninstall'; phase: 'error'; message?: string }
  | { action: 'provider-switch'; phase: 'success'; name: string }
  | { action: 'provider-switch'; phase: 'error'; message?: string }
  | { action: 'provider-detected'; phase: 'info' }
  | { action: 'plugin-install'; phase: 'success'; id: string }
  | { action: 'plugin-install'; phase: 'error'; message?: string }
  | { action: 'plugin-uninstall'; phase: 'success'; id: string }
  | { action: 'plugin-uninstall'; phase: 'error'; message?: string }
  | { action: 'marketplace-add'; phase: 'success'; repo: string }
  | { action: 'marketplace-add'; phase: 'error'; message?: string }
  | { action: 'marketplace-exists'; phase: 'error'; repo: string }
  | { action: 'marketplace-remove'; phase: 'success'; name: string }
  | { action: 'marketplace-remove'; phase: 'error'; message?: string }
  | { action: 'marketplace-refresh'; phase: 'success'; name?: string }
  | { action: 'marketplace-refresh'; phase: 'error'; message?: string }
  | { action: 'prompt-remove'; phase: 'success'; name?: string }
  | { action: 'prompt-activate'; phase: 'success'; name: string }
  | { action: 'prompt-activate'; phase: 'error'; message?: string }
  | { action: 'prompt-save'; phase: 'success'; name: string }
  | { action: 'mcp-save'; phase: 'success'; name?: string }
  | { action: 'mcp-remove'; phase: 'success'; name?: string };

type RemoteSettingsFeedbackInput =
  | { action: 'profiles-load'; phase: 'error'; message?: string }
  | { action: 'runtime-status'; phase: 'error'; message?: string }
  | { action: 'profile-name'; phase: 'error' }
  | { action: 'ssh-target'; phase: 'error' }
  | { action: 'profile-save'; phase: 'success' }
  | { action: 'profile-save'; phase: 'error'; message?: string }
  | { action: 'profile-delete'; phase: 'success' }
  | { action: 'profile-delete'; phase: 'error'; message?: string }
  | { action: 'profile-incomplete'; phase: 'error' }
  | { action: 'connection-test'; phase: 'success' }
  | { action: 'connection-test'; phase: 'error'; message?: string }
  | { action: 'runtime-install'; phase: 'success' }
  | { action: 'runtime-install'; phase: 'error'; message?: string }
  | { action: 'runtime-update'; phase: 'success' }
  | { action: 'runtime-update'; phase: 'error'; message?: string }
  | { action: 'runtime-delete'; phase: 'success' }
  | { action: 'runtime-delete'; phase: 'error'; message?: string };

type RemoteSettingsSurfaceCopyInput =
  | { action: 'runtime-select-profile' }
  | { action: 'runtime-status-error'; message?: string }
  | { action: 'runtime-status-summary' }
  | { action: 'remote-environment' }
  | { action: 'runtime-delete-dialog' };

export function buildRemovalDialogCopy(target: RemovalTarget, t: TFunction): RemovalDialogCopy {
  switch (target.kind) {
    case 'repository':
      return {
        title: t('Remove repository'),
        description: t('{{name}} will be removed from the workspace.', { name: target.name }),
        consequence: t('Local files will not be deleted.'),
        actionLabel: t('Remove repository'),
      };
    case 'temp-session':
      return {
        title: t('Delete temp session'),
        description: t('{{name}} and its directory will be deleted.', { name: target.name }),
        consequence: t('This action cannot be undone.'),
        actionLabel: t('Delete temp session'),
      };
    case 'worktree':
      if (target.prunable) {
        return {
          title: t('Delete Worktree'),
          description: t('Worktree {{name}} records will be removed from Git.', {
            name: target.name,
          }),
          consequence: t('The directory has already been removed.'),
          actionLabel: t('Delete worktree'),
        };
      }

      return {
        title: t('Delete Worktree'),
        description: t('Worktree {{name}} and its directory will be deleted.', {
          name: target.name,
        }),
        consequence: t('This action cannot be undone.'),
        actionLabel: t('Delete worktree'),
      };
  }
}

export function buildOperationToastCopy(
  input: OperationToastInput,
  t: TFunction
): { title: string; description?: string } {
  if (input.kind === 'temp-session') {
    if (input.phase === 'loading' && input.action === 'create') {
      return { title: t('Creating temp session'), description: input.label };
    }

    if (input.phase === 'loading' && input.action === 'delete') {
      return { title: t('Deleting temp session'), description: input.label };
    }

    if (input.phase === 'success' && input.action === 'create') {
      return { title: t('Temp Session created'), description: input.label };
    }

    if (input.phase === 'success' && input.action === 'delete') {
      return { title: t('Temp Session deleted'), description: input.label };
    }

    if (input.phase === 'error' && input.action === 'create') {
      return { title: t('Failed to create temp session'), description: input.message };
    }

    return { title: t('Failed to delete temp session'), description: input.message };
  }

  if (input.phase === 'loading') {
    return { title: t('Deleting worktree'), description: input.label };
  }

  if (input.phase === 'success') {
    return { title: t('Worktree deleted'), description: input.label };
  }

  return { title: t('Failed to delete worktree'), description: input.message };
}

export function buildFileWorkflowToastCopy(
  input: FileWorkflowToastInput,
  t: TFunction
): { title: string; description?: string } {
  switch (input.action) {
    case 'send-to-session':
      return {
        title: t('Sent to session'),
        description: input.target,
      };

    case 'file-save':
      return {
        title: t('Save failed'),
        description: input.message || t('Unknown error'),
      };

    case 'file-read':
      return {
        title: t('File read failed'),
        description: input.message || t('Unknown error'),
      };

    case 'file-transfer':
      return input.phase === 'success'
        ? {
            title: t('{{operation}} completed', {
              operation: input.operation === 'copy' ? 'Copy' : 'Move',
            }),
            description: t('{{count}} file(s) successful', { count: input.count }),
          }
        : {
            title: t('Operation failed'),
            description: t('{{count}} file(s) failed', { count: input.count }),
          };
  }
}

export function buildChatInputToastCopy(
  input: ChatInputToastInput,
  t: TFunction
): { title: string; description: string } {
  switch (input.action) {
    case 'message-send':
      return {
        title: t('Failed to send message'),
        description: input.message || t('Unknown error'),
      };

    case 'image-size':
      return {
        title: t('Image too large'),
        description: t('Max image size is {{size}}MB', { size: input.sizeMb }),
      };

    case 'image-save':
      return {
        title: t('Failed to save image'),
        description: input.message || t('Unknown error'),
      };

    case 'image-count':
      return {
        title: t('Too many images'),
        description: t('Max images is {{count}}', { count: input.count }),
      };
  }
}

export function buildChatNotificationCopy(
  input: ChatNotificationInput,
  t: TFunction
): { title: string; body: string } {
  switch (input.action) {
    case 'command-completed':
      return {
        title: t('{{command}} completed', { command: input.command }),
        body: input.body,
      };

    case 'waiting-input':
      return {
        title: t('{{command}} waiting for input', { command: input.command }),
        body: input.preview || t('User response required'),
      };
  }
}

export function buildWorkspaceToastCopy(
  input: WorkspaceToastInput,
  t: TFunction
): { title: string; description: string } {
  switch (input.action) {
    case 'repository-hide':
      return {
        title: t('Repository hidden'),
        description: t('Hidden repositories will not appear in the sidebar'),
      };
  }
}

export function buildClipboardToastCopy(
  input: ClipboardToastInput,
  t: TFunction
): { title: string; description: string } {
  if (input.phase === 'success') {
    return {
      title: t('Copied'),
      description:
        input.subject === 'commit-id'
          ? t('Commit ID copied to clipboard')
          : input.subject === 'path'
            ? t('Path copied to clipboard')
            : input.subject === 'relative-path'
              ? t('Relative path copied to clipboard')
              : t('Review content copied to clipboard'),
    };
  }

  return {
    title: t('Copy failed'),
    description: input.message || t('Failed to copy content'),
  };
}

export function buildSourceControlToastCopy(
  input: SourceControlToastInput,
  t: TFunction
): { title: string; description: string } {
  if (input.action === 'revert') {
    if (input.phase === 'success') {
      return {
        title: t('Revert successful'),
        description: t('Commit has been reverted'),
      };
    }

    return {
      title: t('Revert failed'),
      description: input.message || t('Unknown error'),
    };
  }

  if (input.action === 'reset') {
    if (input.phase === 'success') {
      return {
        title: t('Reset successful'),
        description: t('Reset to {{mode}} mode', { mode: input.mode }),
      };
    }

    return {
      title: t('Reset failed'),
      description: input.message || t('Unknown error'),
    };
  }

  const titleByAction = {
    stage: 'Stage failed',
    unstage: 'Unstage failed',
    discard: 'Discard failed',
    commit: 'Commit failed',
  } as const;

  return {
    title: t(titleByAction[input.action]),
    description: input.message || t('Unknown error'),
  };
}

export function buildSourceControlWorkflowToastCopy(
  input: SourceControlWorkflowToastInput,
  t: TFunction
): { title: string; description?: string } {
  switch (input.action) {
    case 'sync':
      if (input.phase === 'error') {
        return {
          title: t('Sync failed'),
          description: input.message || t('Unknown error'),
        };
      }

      if (input.pulled > 0 && input.pushed > 0) {
        return {
          title: t('Sync completed'),
          description: t('Pulled {{pulled}} commit(s), pushed {{pushed}} commit(s) on {{branch}}', {
            pulled: input.pulled,
            pushed: input.pushed,
            branch: input.branch,
          }),
        };
      }

      if (input.pulled > 0) {
        return {
          title: t('Sync completed'),
          description: t('Pulled {{count}} commit(s) on {{branch}}', {
            count: input.pulled,
            branch: input.branch,
          }),
        };
      }

      if (input.pushed > 0) {
        return {
          title: t('Sync completed'),
          description: t('Pushed {{count}} commit(s) on {{branch}}', {
            count: input.pushed,
            branch: input.branch,
          }),
        };
      }

      return {
        title: t('Already up to date'),
        description: t('{{branch}} is in sync with remote', { branch: input.branch }),
      };

    case 'publish':
      return input.phase === 'success'
        ? {
            title: t('Branch published'),
            description: t('Branch {{branch}} is now tracking origin/{{branch}}', {
              branch: input.branch,
            }),
          }
        : {
            title: t('Publish failed'),
            description: input.message || t('Unknown error'),
          };

    case 'branch-switch':
      return input.phase === 'success'
        ? {
            title: t('Branch switched'),
            description: t('Branch switched to {{branch}}', { branch: input.branch }),
          }
        : {
            title: t('Failed to switch branch'),
            description: input.message || t('Unknown error'),
          };

    case 'branch-create':
      return input.phase === 'success'
        ? {
            title: t('Branch created'),
            description: t('Branch switched to {{branch}}', { branch: input.branch }),
          }
        : {
            title: t('Failed to create branch'),
            description: input.message || t('Unknown error'),
          };

    case 'commit':
      return input.phase === 'success'
        ? {
            title: t('Commit successful'),
            description: t('Committed {{count}} files', { count: input.count }),
          }
        : {
            title: t('Commit failed'),
            description: input.message || t('Unknown error'),
          };

    case 'file-save':
      return input.phase === 'success'
        ? { title: t('File saved') }
        : {
            title: t('Failed to save file'),
            description: input.message || t('Unknown error'),
          };

    case 'commit-message':
      return {
        title: t('Failed to generate commit message'),
        description: input.message || t('Unknown error'),
      };

    case 'merge-stash':
      return {
        title: t('Changes stashed'),
        description:
          t(
            'Your uncommitted changes were stashed. After resolving conflicts, run "git stash pop" in:'
          ) +
          '\n' +
          input.paths.join('\n'),
      };

    case 'merge-warning':
      return {
        title: t('Merge completed with warnings'),
        description: input.warnings.join('\n'),
      };
  }
}

export function buildSettingsWorkflowToastCopy(
  input: SettingsWorkflowToastInput,
  t: TFunction
): { title: string; description?: string } {
  switch (input.action) {
    case 'cli-install':
      return input.phase === 'success'
        ? {
            title: t('CLI install success'),
            description: t("'infilux' command installed to {{path}}", {
              path: input.path ?? '',
            }),
          }
        : {
            title: t('CLI install failed'),
            description: input.message || t('Unknown error'),
          };

    case 'cli-uninstall':
      return input.phase === 'success'
        ? {
            title: t('CLI uninstall success'),
            description: t("'infilux' command uninstalled"),
          }
        : {
            title: t('CLI uninstall failed'),
            description: input.message || t('Unknown error'),
          };

    case 'provider-switch':
      return input.phase === 'success'
        ? {
            title: t('Provider switched'),
            description: input.name,
          }
        : {
            title: t('Switch failed'),
            description: input.message || t('Unknown error'),
          };
    case 'provider-detected':
      return {
        title: t('New provider detected'),
        description: t('Click to save this config'),
      };
    case 'plugin-install':
      return input.phase === 'success'
        ? {
            title: t('Plugin installed'),
            description: input.id,
          }
        : {
            title: t('Failed to install plugin'),
            description: input.message || t('Unknown error'),
          };
    case 'plugin-uninstall':
      return input.phase === 'success'
        ? {
            title: t('Plugin uninstalled'),
            description: input.id,
          }
        : {
            title: t('Failed to uninstall plugin'),
            description: input.message || t('Unknown error'),
          };
    case 'marketplace-add':
      return input.phase === 'success'
        ? {
            title: t('Marketplace added'),
            description: input.repo,
          }
        : {
            title: t('Failed to add marketplace'),
            description: input.message || t('Unknown error'),
          };
    case 'marketplace-exists':
      return {
        title: t('Marketplace already exists'),
        description: input.repo,
      };
    case 'marketplace-remove':
      return input.phase === 'success'
        ? {
            title: t('Marketplace removed'),
            description: input.name,
          }
        : {
            title: t('Failed to remove marketplace'),
            description: input.message || t('Unknown error'),
          };
    case 'marketplace-refresh':
      return input.phase === 'success'
        ? {
            title: t('Marketplaces updated'),
            description: input.name ?? t('Plugin Marketplaces'),
          }
        : {
            title: t('Failed to update marketplaces'),
            description: input.message || t('Unknown error'),
          };
    case 'prompt-remove':
      return {
        title: t('Prompt preset removed'),
        description: input.name,
      };
    case 'prompt-activate':
      return input.phase === 'success'
        ? {
            title: t('Prompt activated'),
            description: input.name,
          }
        : {
            title: t('Failed to activate prompt'),
            description: input.message || t('Unknown error'),
          };
    case 'prompt-save':
      return {
        title: t('Prompt saved'),
        description: input.name,
      };
    case 'mcp-save':
      return {
        title: t('MCP server saved'),
        description: input.name,
      };
    case 'mcp-remove':
      return {
        title: t('MCP server removed'),
        description: input.name,
      };
  }
}

export function buildRemoteSettingsFeedbackCopy(
  input: RemoteSettingsFeedbackInput,
  t: TFunction
): { title: string; description: string } {
  switch (input.action) {
    case 'profiles-load':
      return {
        title: t('Failed to load remote profiles'),
        description: input.message || t('Unknown error'),
      };

    case 'runtime-status':
      return {
        title: t('Failed to refresh runtime status'),
        description: input.message || t('Unknown error'),
      };

    case 'profile-name':
      return {
        title: t('Profile name is required'),
        description: t('Give this connection a short recognizable name.'),
      };

    case 'ssh-target':
      return {
        title: t('SSH target is required'),
        description: t('Use the same target you would pass to ssh, for example user@example.com.'),
      };

    case 'profile-save':
      return input.phase === 'success'
        ? {
            title: t('Remote profile saved'),
            description: t('You can now use it from the Remote Host entry in the sidebar.'),
          }
        : {
            title: t('Failed to save remote profile'),
            description: input.message || t('Unknown error'),
          };

    case 'profile-delete':
      return input.phase === 'success'
        ? {
            title: t('Remote profile deleted'),
            description: t('The saved SSH connection has been removed.'),
          }
        : {
            title: t('Failed to delete remote profile'),
            description: input.message || t('Unknown error'),
          };

    case 'profile-incomplete':
      return {
        title: t('Profile is incomplete'),
        description: t('Fill in the profile name and SSH target before testing the connection.'),
      };

    case 'connection-test':
      return input.phase === 'success'
        ? {
            title: t('Connection succeeded'),
            description: t('The remote host is reachable and ready for managed runtime setup.'),
          }
        : {
            title: t('Connection failed'),
            description: input.message || t('Unknown error'),
          };

    case 'runtime-install':
      return input.phase === 'success'
        ? {
            title: t('Runtime installed'),
            description: t('The managed remote runtime is now installed on this host.'),
          }
        : {
            title: t('Failed to install runtime'),
            description: input.message || t('Unknown error'),
          };

    case 'runtime-update':
      return input.phase === 'success'
        ? {
            title: t('Runtime updated'),
            description: t('The managed remote runtime was reinstalled successfully.'),
          }
        : {
            title: t('Failed to update runtime'),
            description: input.message || t('Unknown error'),
          };

    case 'runtime-delete':
      return input.phase === 'success'
        ? {
            title: t('Runtime deleted'),
            description: t('All installed managed runtime versions for this profile were removed.'),
          }
        : {
            title: t('Failed to delete runtime'),
            description: input.message || t('Unknown error'),
          };
  }
}

export function buildRemoteSettingsSurfaceCopy(
  input: RemoteSettingsSurfaceCopyInput,
  t: TFunction
): { title: string; description: string } {
  switch (input.action) {
    case 'runtime-select-profile':
      return {
        title: t('Select a profile'),
        description: t('Choose a saved SSH profile above before managing the remote runtime.'),
      };

    case 'runtime-status-error':
      return {
        title: t('Failed to refresh runtime status'),
        description: input.message || t('Unknown error'),
      };

    case 'runtime-status-summary':
      return {
        title: t('Runtime status'),
        description: '',
      };

    case 'remote-environment':
      return {
        title: t('Remote environment'),
        description: '',
      };

    case 'runtime-delete-dialog':
      return {
        title: t('Delete managed remote runtime?'),
        description: t(
          'This will remove all installed managed runtime versions for this SSH profile.'
        ),
      };
  }
}
