import { isRemoteVirtualPath } from '@shared/utils/remotePath';
import { stopAllCodeReviews } from '../services/ai';
import { disposeClaudeIdeBridge } from '../services/claude/ClaudeIdeBridge';
import { persistentAgentSessionRepository } from '../services/session/PersistentAgentSessionRepository';
import { persistentAgentSessionService } from '../services/session/PersistentAgentSessionService';
import { autoUpdaterService } from '../services/updater/AutoUpdater';
import { webInspectorServer } from '../services/webInspector';
import { cleanupExecInPtys, cleanupExecInPtysSync } from '../utils/shell';
import { registerAgentHandlers } from './agent';
import { registerAgentInputHandlers } from './agentInput';
import { registerAgentSessionHandlers } from './agentSession';
import { registerAgentSubagentHandlers } from './agentSubagent';
import { registerAppHandlers } from './app';
import {
  registerClaudeCompletionsHandlers,
  stopClaudeCompletionsWatchers,
} from './claudeCompletions';
import { registerClaudeConfigHandlers } from './claudeConfig';
import { registerClaudePolicyHandlers } from './claudePolicy';
import { registerClaudeProviderHandlers } from './claudeProvider';
import { registerCliHandlers } from './cli';
import { registerDialogHandlers } from './dialog';
import {
  cleanupTempFiles,
  cleanupTempFilesSync,
  registerFileHandlers,
  stopAllFileWatchers,
  stopAllFileWatchersSync,
} from './files';
import { clearAllGitServices, registerGitHandlers } from './git';
import { autoStartHapi, cleanupHapi, cleanupHapiSync, registerHapiHandlers } from './hapi';

export { autoStartHapi };

import { remoteConnectionManager } from '../services/remote/RemoteConnectionManager';
import { registerLogHandlers } from './log';
import { registerNotificationHandlers } from './notification';
import { registerRemoteHandlers } from './remote';
import { registerSearchHandlers } from './search';
import {
  destroyAllTerminals,
  destroyAllTerminalsAndWait,
  registerSessionHandlers,
} from './session';
import { registerSessionStorageHandlers } from './sessionStorage';
import { registerSettingsHandlers } from './settings';
import { registerShellHandlers } from './shell';
import { registerTempWorkspaceHandlers } from './tempWorkspace';
import { cleanupTmuxSync, registerTmuxHandlers } from './tmux';
import { cleanupTodo, cleanupTodoSync, registerTodoHandlers } from './todo';
import { registerUpdaterHandlers } from './updater';
import { registerWebInspectorHandlers } from './webInspector';
import { clearAllWorktreeServices, registerWorktreeHandlers } from './worktree';

export type CleanupTaskStatus = 'completed' | 'failed' | 'timedOut';

export interface CleanupTaskResult {
  label: string;
  status: CleanupTaskStatus;
  durationMs: number;
  errorMessage?: string;
}

export interface CleanupSummary {
  tasks: CleanupTaskResult[];
  timedOutLabels: string[];
  failedLabels: string[];
  hasTimeouts: boolean;
}

interface AsyncCleanupTask {
  label: string;
  timeoutMs: number;
  run: () => Promise<void>;
}

function shouldCleanupTmuxServer(): boolean {
  return !persistentAgentSessionService
    .listCachedSessionsSync()
    .some(
      (session) =>
        session.hostKind === 'tmux' &&
        !isRemoteVirtualPath(session.cwd) &&
        !isRemoteVirtualPath(session.repoPath) &&
        (session.lastKnownState === 'live' || session.lastKnownState === 'reconnecting')
    );
}

export function registerIpcHandlers(): void {
  registerGitHandlers();
  registerWorktreeHandlers();
  registerFileHandlers();
  registerSessionHandlers();
  registerAgentInputHandlers();
  registerSessionStorageHandlers();
  registerAgentHandlers();
  registerAgentSubagentHandlers();
  registerAgentSessionHandlers();
  registerDialogHandlers();
  registerAppHandlers();
  registerCliHandlers();
  registerShellHandlers();
  registerSettingsHandlers();
  registerLogHandlers();
  registerNotificationHandlers();
  registerRemoteHandlers();
  registerUpdaterHandlers();
  registerSearchHandlers();
  registerHapiHandlers();
  registerClaudeProviderHandlers();
  registerClaudePolicyHandlers();
  registerClaudeConfigHandlers();
  registerClaudeCompletionsHandlers();
  registerWebInspectorHandlers();
  registerTempWorkspaceHandlers();
  registerTmuxHandlers();
  registerTodoHandlers();
}

function getCleanupErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function runAsyncCleanupTask(task: AsyncCleanupTask): Promise<CleanupTaskResult> {
  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const taskPromise = Promise.resolve()
    .then(async () => {
      await task.run();
      return {
        label: task.label,
        status: 'completed' as const,
        durationMs: Date.now() - startedAt,
      };
    })
    .catch((error: unknown) => ({
      label: task.label,
      status: 'failed' as const,
      durationMs: Date.now() - startedAt,
      errorMessage: getCleanupErrorMessage(error),
    }));

  const timeoutPromise = new Promise<CleanupTaskResult>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        label: task.label,
        status: 'timedOut',
        durationMs: Date.now() - startedAt,
        errorMessage: `${task.label} exceeded ${task.timeoutMs}ms`,
      });
    }, task.timeoutMs);
  });

  const result = await Promise.race([taskPromise, timeoutPromise]);
  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  if (result.status === 'failed') {
    console.warn(`[cleanup] ${task.label} warning:`, result.errorMessage);
  } else if (result.status === 'timedOut') {
    console.warn(`[cleanup] ${task.label} timed out after ${task.timeoutMs}ms`);
  }

  return result;
}

function runSyncCleanupTask(label: string, task: () => void): CleanupTaskResult {
  const startedAt = Date.now();
  try {
    task();
    return {
      label,
      status: 'completed',
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const errorMessage = getCleanupErrorMessage(error);
    console.warn(`[cleanup] ${label} warning:`, error);
    return {
      label,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      errorMessage,
    };
  }
}

function buildCleanupSummary(tasks: CleanupTaskResult[]): CleanupSummary {
  return {
    tasks,
    timedOutLabels: tasks.filter((task) => task.status === 'timedOut').map((task) => task.label),
    failedLabels: tasks.filter((task) => task.status === 'failed').map((task) => task.label),
    hasTimeouts: tasks.some((task) => task.status === 'timedOut'),
  };
}

export async function cleanupAllResources(): Promise<CleanupSummary> {
  const asyncTasks: AsyncCleanupTask[] = [
    {
      label: 'execInPty',
      timeoutMs: 4_000,
      run: () => cleanupExecInPtys(4_000),
    },
    {
      label: 'hapi',
      timeoutMs: 4_000,
      run: () => cleanupHapi(4_000),
    },
    {
      label: 'terminals',
      timeoutMs: 4_000,
      run: async () => {
        try {
          await destroyAllTerminalsAndWait();
        } catch (error) {
          console.warn('[cleanup] terminals warning:', error);
          destroyAllTerminals();
        }
      },
    },
    {
      label: 'fileWatchers',
      timeoutMs: 4_000,
      run: () => stopAllFileWatchers(),
    },
    {
      label: 'claudeCompletions',
      timeoutMs: 4_000,
      run: () => stopClaudeCompletionsWatchers(),
    },
    {
      label: 'tempFiles',
      timeoutMs: 4_000,
      run: () => cleanupTempFiles(),
    },
    {
      label: 'remoteConnections',
      timeoutMs: 4_000,
      run: () => remoteConnectionManager.cleanup(),
    },
    {
      label: 'todo',
      timeoutMs: 2_000,
      run: () => cleanupTodo(),
    },
    {
      label: 'persistentAgentSessions',
      timeoutMs: 2_000,
      run: () => persistentAgentSessionRepository.close(),
    },
  ];

  const asyncResults = await Promise.all(asyncTasks.map((task) => runAsyncCleanupTask(task)));
  const syncResults: CleanupTaskResult[] = [];

  if (shouldCleanupTmuxServer()) {
    syncResults.push(runSyncCleanupTask('tmux', () => cleanupTmuxSync()));
  }

  syncResults.push(runSyncCleanupTask('webInspector', () => webInspectorServer.stop()));
  syncResults.push(runSyncCleanupTask('codeReviews', () => stopAllCodeReviews()));
  syncResults.push(runSyncCleanupTask('gitServices', () => clearAllGitServices()));
  syncResults.push(runSyncCleanupTask('worktreeServices', () => clearAllWorktreeServices()));
  syncResults.push(runSyncCleanupTask('autoUpdater', () => autoUpdaterService.cleanup()));
  syncResults.push(runSyncCleanupTask('claudeIdeBridge', () => disposeClaudeIdeBridge()));

  return buildCleanupSummary([...asyncResults, ...syncResults]);
}

/**
 * Synchronous cleanup for signal handlers (SIGINT/SIGTERM).
 * Kills child processes immediately without waiting for graceful shutdown.
 * This ensures clean exit when electron-vite terminates quickly.
 */
export function cleanupAllResourcesSync(): void {
  console.log('[app] Sync cleanup starting...');

  // Kill any in-flight execInPty commands first (sync)
  cleanupExecInPtysSync();

  // Kill Hapi/Cloudflared processes (sync)
  cleanupHapiSync();

  if (shouldCleanupTmuxServer()) {
    cleanupTmuxSync();
  }

  // Stop Web Inspector server (sync)
  webInspectorServer.stop();

  // Kill all PTY sessions immediately (sync)
  destroyAllTerminals();

  // Stop all code review processes (sync)
  stopAllCodeReviews();

  // Stop file watchers (sync)
  stopAllFileWatchersSync();

  // Clear service caches (sync)
  clearAllGitServices();
  clearAllWorktreeServices();

  autoUpdaterService.cleanup();

  // Dispose Claude IDE Bridge (sync)
  disposeClaudeIdeBridge();

  void remoteConnectionManager.cleanup();

  // Close Todo database (sync — just nulls the reference, no async callback)
  cleanupTodoSync();

  // Clean up temp files (sync)
  cleanupTempFilesSync();

  console.log('[app] Sync cleanup done');
}
