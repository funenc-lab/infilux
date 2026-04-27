import type {
  ClaudePolicyCatalogRequest,
  PrepareClaudePolicyLaunchRequest,
  ResolveClaudePolicyPreviewRequest,
} from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain } from 'electron';
import { listClaudeCapabilityCatalog } from '../services/claude/CapabilityCatalogService';
import { resolveClaudePolicy } from '../services/claude/ClaudePolicyResolver';
import { prepareClaudeAgentLaunch } from '../services/claude/ClaudeSessionLaunchPreparation';

export function registerClaudePolicyHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_POLICY_CATALOG_LIST,
    async (_, request?: ClaudePolicyCatalogRequest) => {
      return listClaudeCapabilityCatalog(request ?? {});
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_POLICY_PREVIEW_RESOLVE,
    async (_, request: ResolveClaudePolicyPreviewRequest) => {
      const catalog = await listClaudeCapabilityCatalog({
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
      });
      return resolveClaudePolicy({
        catalog,
        repoPath: request.repoPath,
        worktreePath: request.worktreePath,
        globalPolicy: request.globalPolicy ?? null,
        projectPolicy: request.projectPolicy,
        worktreePolicy: request.worktreePolicy,
      });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_POLICY_LAUNCH_PREPARE,
    async (_, request: PrepareClaudePolicyLaunchRequest) => {
      return prepareClaudeAgentLaunch(request);
    }
  );
}
