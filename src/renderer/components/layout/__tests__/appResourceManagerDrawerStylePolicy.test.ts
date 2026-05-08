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
      'flex min-w-0 flex-col gap-3 pe-10 sm:flex-row sm:items-start sm:justify-between'
    );
    expect(drawerSource).toContain(
      'h-8 w-fit max-w-full shrink-0 gap-2 self-start rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground sm:max-w-[10rem] sm:self-auto'
    );
    expect(drawerSource).toContain('<span className="min-w-0 truncate">{refreshLabel}</span>');
    expect(drawerSource).toContain('data-resource-manager-refresh-action');
    expect(drawerSource).toContain(
      "const refreshLabel = foregroundLoading ? t('Refreshing') : t('Refresh');"
    );
    expect(drawerSource).toContain(
      "<RefreshCw className={cn('h-3.5 w-3.5', foregroundLoading && 'animate-spin')} />"
    );
    expect(drawerSource).toContain('control-chip control-chip-strong shrink-0');
    expect(drawerSource).toContain('data-resource-manager-stat={stat.key}');
    expect(drawerSource).toContain('text-[1.35rem] font-semibold leading-none');
  });

  it('separates refresh from bulk resource actions', () => {
    expect(drawerSource).toContain('data-resource-manager-bulk-actions');
    expect(drawerSource).toContain('data-resource-manager-bulk-action-buttons');
    expect(drawerSource).toContain("variant={action.disabled ? 'outline' : 'destructive-outline'}");
    expect(drawerSource).toContain(
      'className="w-full max-w-full min-w-0 justify-center sm:w-auto sm:min-w-[11rem] sm:max-w-[15rem]"'
    );
    expect(drawerSource).toContain('<span className="min-w-0 truncate">{action.label}</span>');
    expect(drawerSource).not.toContain(
      'flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end'
    );
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
