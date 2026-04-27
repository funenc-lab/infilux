import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import type { ClaudePolicyDecisionValue } from './model';

interface ClaudePolicyBatchActionsProps {
  itemCount: number;
  onDecisionChange: (decision: ClaudePolicyDecisionValue) => void;
}

const BATCH_ACTIONS: Array<{
  value: ClaudePolicyDecisionValue;
  label: string;
}> = [
  { value: 'allow', label: 'Enable' },
  { value: 'block', label: 'Disable' },
  { value: 'inherit', label: 'Reset' },
];

export function ClaudePolicyBatchActions({
  itemCount,
  onDecisionChange,
}: ClaudePolicyBatchActionsProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-2" data-policy-batch-controls>
      <span className="ui-type-meta text-muted-foreground" data-policy-batch-count>
        {t('Apply to visible items')}: {itemCount}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {BATCH_ACTIONS.map((action) => (
          <Button
            key={action.value}
            type="button"
            size="xs"
            variant="outline"
            disabled={itemCount === 0}
            data-policy-batch-action={action.value}
            onClick={() => onDecisionChange(action.value)}
          >
            {t(action.label)}
          </Button>
        ))}
      </div>
    </div>
  );
}
