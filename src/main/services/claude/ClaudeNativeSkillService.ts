import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  DisableClaudeNativeSkillRequest,
  DisableClaudeNativeSkillResult,
  RestoreClaudeNativeSkillRequest,
  RestoreClaudeNativeSkillResult,
} from '@shared/types';
import {
  isRemoteVirtualPath,
  parseRemoteVirtualPath,
  toRemoteVirtualPath,
} from '@shared/utils/remotePath';
import { remoteRepositoryBackend } from '../remote/RemoteRepositoryBackend';

interface RuntimePathContext {
  isRemote: boolean;
  connectionId?: string;
  worktreePath: string;
  sourcePath: string;
}

function toComparablePath(inputPath: string): string {
  return inputPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

function toRuntimePathContext(
  request: DisableClaudeNativeSkillRequest | RestoreClaudeNativeSkillRequest
): RuntimePathContext {
  const worktreeIsRemote = isRemoteVirtualPath(request.worktreePath);
  const sourceIsRemote = isRemoteVirtualPath(request.sourcePath);

  if (!worktreeIsRemote) {
    if (sourceIsRemote) {
      throw new Error('Worktree path and source path must use the same runtime');
    }

    return {
      isRemote: false,
      worktreePath: request.worktreePath,
      sourcePath: request.sourcePath,
    };
  }

  const worktreeTarget = parseRemoteVirtualPath(request.worktreePath);
  let sourcePath = request.sourcePath;
  if (sourceIsRemote) {
    const sourceTarget = parseRemoteVirtualPath(request.sourcePath);
    if (worktreeTarget.connectionId !== sourceTarget.connectionId) {
      throw new Error('Worktree path and source path must use the same remote connection');
    }
    sourcePath = sourceTarget.remotePath;
  }

  return {
    isRemote: true,
    connectionId: worktreeTarget.connectionId,
    worktreePath: worktreeTarget.remotePath,
    sourcePath,
  };
}

function assertNativeSkillSourcePath(
  context: RuntimePathContext,
  directoryName: 'skills' | 'skills.disabled'
): string {
  const sourcePath = toComparablePath(context.sourcePath);
  const nativeSkillRoot = `${toComparablePath(context.worktreePath)}/.claude/${directoryName}/`;
  const suffix = '/SKILL.md';
  if (!sourcePath.startsWith(nativeSkillRoot) || !sourcePath.endsWith(suffix)) {
    throw new Error(
      `Source path must be a SKILL.md file inside the worktree .claude/${directoryName} directory`
    );
  }

  const skillName = sourcePath.slice(nativeSkillRoot.length, -suffix.length);
  if (!skillName || skillName.includes('/')) {
    throw new Error('Source path must point to a direct worktree Claude skill directory');
  }

  return skillName;
}

function toResultPath(context: RuntimePathContext, runtimePath: string): string {
  if (!context.isRemote) {
    return runtimePath;
  }

  return toRemoteVirtualPath(context.connectionId ?? '', runtimePath);
}

async function localPathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.promises.access(targetPath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function disableWorkspaceNativeClaudeSkill(
  request: DisableClaudeNativeSkillRequest
): Promise<DisableClaudeNativeSkillResult> {
  const context = toRuntimePathContext(request);
  const skillName = assertNativeSkillSourcePath(context, 'skills');
  const joinPath = context.isRemote ? path.posix.join : path.join;
  const sourceDir = joinPath(context.worktreePath, '.claude', 'skills', skillName);
  const disabledDir = joinPath(context.worktreePath, '.claude', 'skills.disabled', skillName);
  const disabledExists = context.isRemote
    ? await remoteRepositoryBackend.exists(toResultPath(context, disabledDir))
    : await localPathExists(disabledDir);

  if (disabledExists) {
    throw new Error('Disabled skill destination already exists');
  }

  if (context.isRemote) {
    await remoteRepositoryBackend.rename(
      toResultPath(context, sourceDir),
      toResultPath(context, disabledDir)
    );
  } else {
    await fs.promises.mkdir(path.dirname(disabledDir), { recursive: true });
    await fs.promises.rename(sourceDir, disabledDir);
  }

  return {
    ok: true,
    sourcePath: request.sourcePath,
    disabledPath: toResultPath(context, disabledDir),
  };
}

export async function restoreWorkspaceNativeClaudeSkill(
  request: RestoreClaudeNativeSkillRequest
): Promise<RestoreClaudeNativeSkillResult> {
  const context = toRuntimePathContext(request);
  const skillName = assertNativeSkillSourcePath(context, 'skills.disabled');
  const joinPath = context.isRemote ? path.posix.join : path.join;
  const sourceDir = joinPath(context.worktreePath, '.claude', 'skills.disabled', skillName);
  const restoredDir = joinPath(context.worktreePath, '.claude', 'skills', skillName);
  const restoredExists = context.isRemote
    ? await remoteRepositoryBackend.exists(toResultPath(context, restoredDir))
    : await localPathExists(restoredDir);

  if (restoredExists) {
    throw new Error('Active skill destination already exists');
  }

  if (context.isRemote) {
    await remoteRepositoryBackend.rename(
      toResultPath(context, sourceDir),
      toResultPath(context, restoredDir)
    );
  } else {
    await fs.promises.mkdir(path.dirname(restoredDir), { recursive: true });
    await fs.promises.rename(sourceDir, restoredDir);
  }

  return {
    ok: true,
    sourcePath: request.sourcePath,
    restoredPath: toResultPath(context, restoredDir),
  };
}
