import type { ClaudeCapabilityCatalogItem, ClaudePolicyConfig } from '@shared/types';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { ClaudePolicyBatchActions } from './ClaudePolicyBatchActions';
import { ClaudePolicyDecisionControls } from './ClaudePolicyDecisionControls';
import { ClaudePolicySourcePaths } from './ClaudePolicySourcePaths';
import { type ClaudePolicyDecisionValue, getClaudePolicyDecision } from './model';
import { getWorkspaceNativeClaudeSkillSourcePaths } from './sourcePaths';

interface ClaudePolicyCapabilityListProps {
  sectionId?: string;
  title: string;
  description?: string;
  items: ClaudeCapabilityCatalogItem[];
  policy: ClaudePolicyConfig;
  nativeSkillRootPath?: string;
  onDecisionChange: (id: string, decision: ClaudePolicyDecisionValue) => void;
  onBatchDecisionChange: (ids: string[], decision: ClaudePolicyDecisionValue) => void;
  onDisableNativeSkill?: (sourcePath: string) => void;
}

export function ClaudePolicyCapabilityList({
  sectionId,
  title,
  description,
  items,
  policy,
  nativeSkillRootPath,
  onDecisionChange,
  onBatchDecisionChange,
  onDisableNativeSkill,
}: ClaudePolicyCapabilityListProps) {
  const { t } = useI18n();
  const itemIds = items.map((item) => item.id);

  return (
    <section className="space-y-3" data-policy-section={sectionId}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h3 className="ui-type-block-title">{title}</h3>
          {description ? <p className="ui-type-meta text-muted-foreground">{description}</p> : null}
        </div>
        <ClaudePolicyBatchActions
          itemCount={itemIds.length}
          onDecisionChange={(decision) => onBatchDecisionChange(itemIds, decision)}
        />
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const decision = getClaudePolicyDecision(policy, 'capability', item.id);
          const nativeClaudeSkillPaths =
            decision === 'block' && item.kind === 'legacy-skill' && nativeSkillRootPath
              ? getWorkspaceNativeClaudeSkillSourcePaths(item, nativeSkillRootPath)
              : [];

          return (
            <div
              key={item.id}
              data-policy-item-id={item.id}
              className="rounded-xl border border-border/70 bg-background/60 p-3"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="ui-type-block-title">{item.name}</div>
                    <Badge variant="secondary" size="sm">
                      {t(item.sourceScope)}
                    </Badge>
                  </div>
                  <ClaudePolicySourcePaths
                    itemId={item.id}
                    sourcePath={item.sourcePath}
                    sourcePaths={item.sourcePaths}
                    triggerDataAttribute="data-policy-source-paths-trigger"
                    contentDataAttribute="data-policy-source-paths-content"
                  />
                  {nativeClaudeSkillPaths.length > 0 ? (
                    <div
                      data-policy-native-warning={item.id}
                      className="flex flex-col gap-2 rounded-lg border border-warning/45 bg-warning/8 px-3 py-2 ui-type-meta text-warning-foreground md:flex-row md:items-center md:justify-between"
                    >
                      <span>
                        {t(
                          'This skill is disabled in policy, but its source file is inside this workspace native skill directory. The runtime may still auto-load it until the file is moved, renamed, or removed.'
                        )}
                      </span>
                      {onDisableNativeSkill ? (
                        <button
                          type="button"
                          data-policy-native-action="disable-file"
                          className="shrink-0 rounded-md border border-warning/45 bg-background/70 px-2 py-1 text-warning-foreground transition-colors hover:bg-warning/12"
                          onClick={() => onDisableNativeSkill(nativeClaudeSkillPaths[0])}
                        >
                          {t('Disable file')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <ClaudePolicyDecisionControls
                  decision={decision}
                  onDecisionChange={(nextDecision) => onDecisionChange(item.id, nextDecision)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
