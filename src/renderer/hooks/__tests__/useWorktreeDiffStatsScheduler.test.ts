import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useWorktreeDiffStatsScheduler', () => {
  it('owns timer lifecycle through the shared scheduler and fetches one path at a time', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../useWorktreeDiffStatsScheduler.ts'),
      'utf8'
    );

    expect(source).toContain('createDiffStatsSchedule');
    expect(source).toContain('fetchDiffStats([path])');
    expect(source).toContain('schedule.start()');
    expect(source).toContain('return () => schedule.stop()');
  });

  it('is mounted once by the application shell rather than a sidebar panel', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '../../App.tsx'), 'utf8');
    const treeSidebarSource = fs.readFileSync(
      path.resolve(__dirname, '../../components/layout/TreeSidebar.tsx'),
      'utf8'
    );

    expect(appSource).toContain('useWorktreeDiffStatsScheduler();');
    expect(treeSidebarSource).not.toContain('useWorktreeDiffStatsScheduler({');
  });
});
