import type { ClaudeMcpCatalogItem, ClaudePolicyConfig } from '@shared/types';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import { ClaudePolicyDecisionControls } from './ClaudePolicyDecisionControls';
import {
  type ClaudePolicyBucket,
  type ClaudePolicyDecisionValue,
  getClaudePolicyDecision,
} from './model';

interface ClaudePolicyMcpListProps {
  sectionId?: string;
  title: string;
  description?: string;
  items: ClaudeMcpCatalogItem[];
  bucket: Extract<ClaudePolicyBucket, 'sharedMcp' | 'personalMcp'>;
  policy: ClaudePolicyConfig;
  onDecisionChange: (id: string, decision: ClaudePolicyDecisionValue) => void;
}

export function ClaudePolicyMcpList({
  sectionId,
  title,
  description,
  items,
  bucket,
  policy,
  onDecisionChange,
}: ClaudePolicyMcpListProps) {
  const { t } = useI18n();

  return (
    <section className="space-y-3" data-policy-section={sectionId}>
      <div className="space-y-1">
        <h3 className="ui-type-block-title">{title}</h3>
        {description ? <p className="ui-type-meta text-muted-foreground">{description}</p> : null}
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const decision = getClaudePolicyDecision(policy, bucket, item.id);

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
                    <Badge variant="outline" size="sm">
                      {t(item.scope)}
                    </Badge>
                    <Badge variant="secondary" size="sm">
                      {t(item.sourceScope)}
                    </Badge>
                    {item.transportType ? (
                      <Badge variant="info" size="sm">
                        {t(item.transportType)}
                      </Badge>
                    ) : null}
                  </div>
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
