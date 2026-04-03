import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildBulkReloadPlan, buildExternalReloadBatchPlan } from '../editorReloadPolicy';

describe('buildBulkReloadPlan', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

describe('buildExternalReloadBatchPlan', () => {
  it('deduplicates repeated external changes and reloads each open path once', () => {
    const plan = buildExternalReloadBatchPlan(
      [
        { path: '/Repo/A.ts', isDirty: false },
        { path: '/Repo/B.ts', isDirty: true },
        { path: '/Repo/C.ts', isDirty: false },
      ],
      ['/repo/a.ts', '/Repo/A.ts', '/repo/b.ts', '/repo/missing.ts', '/repo/c.ts', '/repo/c.ts']
    );

    expect(plan.reloadPaths).toEqual(['/Repo/A.ts', '/Repo/B.ts', '/Repo/C.ts']);
  });

  it('returns an empty plan when no changed path maps to an open tab', () => {
    const plan = buildExternalReloadBatchPlan(
      [{ path: '/Repo/A.ts', isDirty: false }],
      ['/repo/missing.ts']
    );

    expect(plan.reloadPaths).toEqual([]);
  });
});
