import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const drawerSource = readFileSync(resolve(currentDir, '../AppResourceManagerDrawer.tsx'), 'utf8');

describe('app resource manager drawer style policy', () => {
  it('uses control-console surfaces instead of a generic background sheet', () => {
    expect(drawerSource).toContain('bg-[color:var(--theme-popover-base)]');
    expect(drawerSource).not.toContain('max-w-[48rem] bg-background');
  });

  it('presents the drawer header as a compact operational status strip', () => {
    expect(drawerSource).toContain('w-[min(50rem,calc(100vw-1rem))]');
    expect(drawerSource).toContain(
      'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'
    );
    expect(drawerSource).toContain(
      'flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end'
    );
    expect(drawerSource).toContain('min-w-0 flex-1 justify-center sm:min-w-[11rem] sm:flex-none');
    expect(drawerSource).toContain('<span className="min-w-0 truncate">{action.label}</span>');
    expect(drawerSource).toContain('control-chip control-chip-strong shrink-0');
    expect(drawerSource).toContain('data-resource-manager-stat={stat.key}');
    expect(drawerSource).toContain('text-[1.35rem] font-semibold leading-none');
  });

  it('keeps summary and resource rows on dense control-console surfaces', () => {
    expect(drawerSource).toContain('control-panel-muted rounded-[1.25rem] p-3');
    expect(drawerSource).toContain(
      'rounded-xl border border-border/45 bg-[color:color-mix(in_oklch,var(--control-surface)_42%,transparent)] px-3 py-3'
    );
    expect(drawerSource).toContain('data-resource-manager-card={item.resource.kind}');
    expect(drawerSource).toContain('lg:grid-cols-[minmax(0,1fr)_auto]');
    expect(drawerSource).toContain('data-resource-manager-metric={metric.key}');
    expect(drawerSource).toContain('border-t border-border/55 pt-3 sm:grid-cols-2 xl:grid-cols-3');
  });

  it('uses shared status chips instead of mixing badge styling into resource rows', () => {
    expect(drawerSource).toContain('function getStatusChipClassName');
    expect(drawerSource).toContain('control-chip control-chip-live');
    expect(drawerSource).toContain('control-chip control-chip-wait');
    expect(drawerSource).toContain('control-chip control-chip-done');
    expect(drawerSource).not.toContain("from '@/components/ui/badge'");
  });
});
