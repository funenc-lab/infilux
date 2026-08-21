import { describe, expect, it, vi } from 'vitest';
import { CodexWorkspaceHistoryMigrationCoordinator } from '../CodexWorkspaceHistoryMigrationCoordinator';

describe('CodexWorkspaceHistoryMigrationCoordinator', () => {
  it('defers migration and coalesces work for the same history directory', async () => {
    const deferredOperations: Array<() => void> = [];
    const migration = vi.fn(async () => undefined);
    const coordinator = new CodexWorkspaceHistoryMigrationCoordinator({
      defer: (operation) => {
        deferredOperations.push(operation);
      },
    });

    const first = coordinator.schedule('/histories/worktree-a/sessions', migration);
    const second = coordinator.schedule('/histories/worktree-a/sessions', migration);

    expect(migration).not.toHaveBeenCalled();
    expect(deferredOperations).toHaveLength(1);
    expect(second).toBe(first);

    deferredOperations[0]?.();
    await first;

    expect(migration).toHaveBeenCalledTimes(1);
  });
});
