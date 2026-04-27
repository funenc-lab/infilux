import type { ClaudeCapabilityCatalog, ResolvedClaudePolicy } from '@shared/types';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { isLegacySkillCapabilityId } from './model';

interface ClaudePolicyPreviewProps {
  catalog: ClaudeCapabilityCatalog | null;
  resolvedPolicy: ResolvedClaudePolicy | null;
  staleNotice?: string | null;
  showHeader?: boolean;
}

function getItemName(lookup: Map<string, string>, id: string): string {
  return lookup.get(id) ?? id;
}

interface PreviewCardProps {
  title: string;
  allowedCount: number;
  blockedCount: number;
  emptyLabel: string;
  testId: string;
  items: string[];
  lookup: Map<string, string>;
}

function PreviewCard({
  title,
  allowedCount,
  blockedCount,
  emptyLabel,
  testId,
  items,
  lookup,
}: PreviewCardProps) {
  const { t } = useI18n();

  return (
    <div
      data-policy-preview-group={testId}
      className="rounded-xl border border-border/70 bg-background/60 p-3"
    >
      <div className="ui-type-meta text-muted-foreground">{title}</div>
      <div className="mt-1 text-lg font-semibold">{allowedCount}</div>
      <div className="ui-type-meta text-muted-foreground">
        {t('{{count}} blocked', { count: blockedCount })}
      </div>
      <div className="mt-3 space-y-2">
        <div className="ui-type-meta text-muted-foreground">{t('Currently enabled')}</div>
        {items.length > 0 ? (
          <div className="max-h-40 overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-1.5">
              {items.map((id) => (
                <Badge key={id} variant="secondary" size="sm">
                  {getItemName(lookup, id)}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <p className="ui-type-meta text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

export function ClaudePolicyPreview({
  catalog,
  resolvedPolicy,
  staleNotice,
  showHeader = true,
}: ClaudePolicyPreviewProps) {
  const { t } = useI18n();
  const skillLookup = new Map(
    (catalog?.capabilities ?? [])
      .filter((item) => item.kind === 'legacy-skill')
      .map((item) => [item.id, item.name] as const)
  );
  const sharedMcpLookup = new Map(
    (catalog?.sharedMcpServers ?? []).map((item) => [item.id, item.name] as const)
  );
  const personalMcpLookup = new Map(
    (catalog?.personalMcpServers ?? []).map((item) => [item.id, item.name] as const)
  );
  const allowedSkillIds =
    resolvedPolicy?.allowedCapabilityIds.filter(isLegacySkillCapabilityId) ?? [];
  const blockedSkillIds =
    resolvedPolicy?.blockedCapabilityIds.filter(isLegacySkillCapabilityId) ?? [];

  return (
    <section className="space-y-3">
      {showHeader ? (
        <div className="space-y-1">
          <h3 className="ui-type-block-title">{t('Effective Access')}</h3>
          <p className="ui-type-meta text-muted-foreground">
            {t(
              'Review the resolved skill and MCP access that is currently effective for this scope.'
            )}
          </p>
        </div>
      ) : null}

      {staleNotice ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/45 bg-warning/8 p-3 text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="ui-type-meta">{staleNotice}</p>
        </div>
      ) : null}

      {resolvedPolicy ? (
        <div className="grid gap-3 lg:grid-cols-3">
          <PreviewCard
            title={t('Skills')}
            allowedCount={allowedSkillIds.length}
            blockedCount={blockedSkillIds.length}
            emptyLabel={t('No effective skills.')}
            testId="skills"
            items={allowedSkillIds}
            lookup={skillLookup}
          />

          <PreviewCard
            title={t('Shared MCP')}
            allowedCount={resolvedPolicy.allowedSharedMcpIds.length}
            blockedCount={resolvedPolicy.blockedSharedMcpIds.length}
            emptyLabel={t('No effective shared MCP servers.')}
            testId="shared-mcp"
            items={resolvedPolicy.allowedSharedMcpIds}
            lookup={sharedMcpLookup}
          />

          <PreviewCard
            title={t('Personal MCP')}
            allowedCount={resolvedPolicy.allowedPersonalMcpIds.length}
            blockedCount={resolvedPolicy.blockedPersonalMcpIds.length}
            emptyLabel={t('No effective personal MCP servers.')}
            testId="personal-mcp"
            items={resolvedPolicy.allowedPersonalMcpIds}
            lookup={personalMcpLookup}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/80 bg-background/40 p-4">
          <p className="ui-type-meta text-muted-foreground">
            {t('Preview data will appear after the current draft resolves successfully.')}
          </p>
        </div>
      )}
    </section>
  );
}
