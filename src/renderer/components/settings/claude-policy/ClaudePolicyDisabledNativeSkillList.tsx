import type { ClaudeCapabilityCatalogItem } from '@shared/types';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { ClaudePolicySourcePaths } from './ClaudePolicySourcePaths';

interface ClaudePolicyDisabledNativeSkillListProps {
  items: ClaudeCapabilityCatalogItem[];
  onRestoreNativeSkill?: (sourcePath: string) => void;
}

export function ClaudePolicyDisabledNativeSkillList({
  items,
  onRestoreNativeSkill,
}: ClaudePolicyDisabledNativeSkillListProps) {
  const { t } = useI18n();

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" data-policy-section="disabled-native-skills">
      <div className="space-y-1">
        <h3 className="ui-type-block-title">{t('Quarantined Skills')}</h3>
        <p className="ui-type-meta text-muted-foreground">
          {t('Skill folders moved out of this worktree .claude/skills path.')}
        </p>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            data-policy-disabled-native-item-id={item.id}
            className="rounded-xl border border-border/70 bg-background/60 p-3"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="ui-type-block-title">{item.name}</div>
                  <Badge variant="secondary" size="sm">
                    {t('Quarantined')}
                  </Badge>
                </div>
                <ClaudePolicySourcePaths
                  itemId={`disabled-native:${item.id}`}
                  sourcePath={item.sourcePath}
                  sourcePaths={item.sourcePaths}
                  triggerDataAttribute="data-policy-disabled-native-source-paths-trigger"
                  contentDataAttribute="data-policy-disabled-native-source-paths-content"
                />
              </div>

              {item.sourcePath && onRestoreNativeSkill ? (
                <button
                  type="button"
                  data-policy-native-action="restore-file"
                  className="shrink-0 rounded-md border border-border/70 bg-background/70 px-2 py-1 ui-type-meta text-foreground transition-colors hover:bg-accent/40"
                  onClick={() => onRestoreNativeSkill(item.sourcePath ?? '')}
                >
                  {t('Restore file')}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
