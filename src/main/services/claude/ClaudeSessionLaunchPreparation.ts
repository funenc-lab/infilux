import type {
  PrepareClaudePolicyLaunchRequest,
  PrepareClaudePolicyLaunchResult,
} from '@shared/types';
import { listClaudeCapabilityCatalog } from './CapabilityCatalogService';
import { resolveClaudePolicy } from './ClaudePolicyResolver';
import { projectClaudeRuntimePolicy } from './ClaudeRuntimeProjector';

export interface ClaudeSessionLaunchPreparationDependencies {
  listClaudeCapabilityCatalog?: typeof listClaudeCapabilityCatalog;
  resolveClaudePolicy?: typeof resolveClaudePolicy;
  projectClaudeRuntimePolicy?: typeof projectClaudeRuntimePolicy;
}

export async function prepareClaudeAgentLaunch(
  request: PrepareClaudePolicyLaunchRequest,
  dependencies: ClaudeSessionLaunchPreparationDependencies = {}
): Promise<PrepareClaudePolicyLaunchResult> {
  const listCatalog = dependencies.listClaudeCapabilityCatalog ?? listClaudeCapabilityCatalog;
  const resolvePolicy = dependencies.resolveClaudePolicy ?? resolveClaudePolicy;
  const projectPolicy = dependencies.projectClaudeRuntimePolicy ?? projectClaudeRuntimePolicy;

  const catalog = await listCatalog({
    repoPath: request.repoPath,
    worktreePath: request.worktreePath,
  });
  const resolvedPolicy = resolvePolicy({
    catalog,
    repoPath: request.repoPath,
    worktreePath: request.worktreePath,
    globalPolicy: request.globalPolicy ?? null,
    projectPolicy: request.projectPolicy,
    worktreePolicy: request.worktreePolicy,
    sessionPolicy: request.sessionPolicy ?? null,
  });
  const projected = await projectPolicy({
    repoPath: request.repoPath,
    worktreePath: request.worktreePath,
    materializationMode: request.materializationMode,
    catalog,
    resolvedPolicy,
  });

  return {
    repoPath: request.repoPath,
    worktreePath: request.worktreePath,
    hash: resolvedPolicy.hash,
    policyHash: resolvedPolicy.hash,
    warnings: [...projected.warnings],
    resolvedPolicy,
    projected,
    appliedAt: Date.now(),
  };
}
