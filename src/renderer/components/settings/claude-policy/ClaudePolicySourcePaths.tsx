import type { ClaudeCapabilityCatalogItem } from '@shared/types';
import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { getCapabilitySourcePaths } from './sourcePaths';

interface ClaudePolicySourcePathsProps {
  itemId: string;
  sourcePath?: ClaudeCapabilityCatalogItem['sourcePath'];
  sourcePaths?: ClaudeCapabilityCatalogItem['sourcePaths'];
  triggerDataAttribute: string;
  contentDataAttribute?: string;
}

export function ClaudePolicySourcePaths({
  itemId,
  sourcePath,
  sourcePaths,
  triggerDataAttribute,
  contentDataAttribute,
}: ClaudePolicySourcePathsProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const resolvedSourcePaths = useMemo(
    () => getCapabilitySourcePaths({ sourcePath, sourcePaths }),
    [sourcePath, sourcePaths]
  );

  if (resolvedSourcePaths.length === 0) {
    return null;
  }

  const triggerAttributes = {
    [triggerDataAttribute]: itemId,
  };
  const contentAttributes = contentDataAttribute
    ? {
        [contentDataAttribute]: itemId,
      }
    : {};

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        onClick={() => setExpanded((current) => !current)}
        {...triggerAttributes}
      >
        <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
        <span>{`${resolvedSourcePaths.length} ${t(resolvedSourcePaths.length === 1 ? 'source' : 'sources')}`}</span>
      </Button>

      {expanded ? (
        <div
          className="rounded-lg border border-border/60 bg-background/50 px-3 py-2"
          {...contentAttributes}
        >
          <ul className="space-y-2">
            {resolvedSourcePaths.map((candidatePath) => (
              <li key={candidatePath} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {candidatePath === sourcePath ? (
                    <Badge variant="outline" size="sm">
                      {t('Primary')}
                    </Badge>
                  ) : null}
                </div>
                <div className="ui-type-meta break-all text-muted-foreground">{candidatePath}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
