import { describe, expect, it } from 'vitest';
import { buildBulkReloadPlan } from '../editorReloadPolicy';

describe('buildBulkReloadPlan', () => {
  it('reloads only the active tab immediately and marks the rest as stale', () => {
    const plan = buildBulkReloadPlan(
      [
        { path: '/repo/a.ts', isDirty: false },
        { path: '/repo/b.ts', isDirty: false },
        { path: '/repo/c.ts', isDirty: true },
      ],
      '/repo/b.ts'
    );

    expect(plan.immediateReloadPaths).toEqual(['/repo/b.ts']);
    expect(plan.stalePaths).toEqual(['/repo/a.ts', '/repo/c.ts']);
  });

  it('does not schedule eager reload when no active tab exists', () => {
    const plan = buildBulkReloadPlan(
      [
        { path: '/repo/a.ts', isDirty: false },
        { path: '/repo/b.ts', isDirty: false },
      ],
      null
    );

    expect(plan.immediateReloadPaths).toEqual([]);
    expect(plan.stalePaths).toEqual(['/repo/a.ts', '/repo/b.ts']);
  });

  it('matches the active tab using normalized paths and returns canonical tab paths', () => {
    const plan = buildBulkReloadPlan(
      [
        { path: '/Repo/Active.ts', isDirty: false },
        { path: '/Repo/Other.ts', isDirty: false },
      ],
      '/repo/active.ts'
    );

    expect(plan.immediateReloadPaths).toEqual(['/Repo/Active.ts']);
    expect(plan.stalePaths).toEqual(['/Repo/Other.ts']);
  });

  it('deduplicates repeated tab paths in the bulk reload plan', () => {
    const plan = buildBulkReloadPlan(
      [
        { path: '/Repo/Active.ts', isDirty: false },
        { path: '/repo/active.ts', isDirty: true },
        { path: '/Repo/Other.ts', isDirty: false },
        { path: '/repo/other.ts', isDirty: false },
      ],
      '/repo/active.ts'
    );

    expect(plan.immediateReloadPaths).toEqual(['/Repo/Active.ts']);
    expect(plan.stalePaths).toEqual(['/Repo/Other.ts']);
  });
});
