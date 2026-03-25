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
});
