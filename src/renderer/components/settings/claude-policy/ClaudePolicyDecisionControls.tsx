import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { ClaudePolicyDecisionValue } from './model';

interface ClaudePolicyDecisionControlsProps {
  decision: ClaudePolicyDecisionValue;
  onDecisionChange: (decision: ClaudePolicyDecisionValue) => void;
}

const PRIMARY_DECISION_BUTTONS: Array<{
  value: Extract<ClaudePolicyDecisionValue, 'allow' | 'block'>;
  label: string;
}> = [
  { value: 'allow', label: 'Enabled' },
  { value: 'block', label: 'Disabled' },
];

export function ClaudePolicyDecisionControls({
  decision,
  onDecisionChange,
}: ClaudePolicyDecisionControlsProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-border/70 bg-background/90 p-1">
        {PRIMARY_DECISION_BUTTONS.map((entry) => (
          <Button
            key={entry.value}
            size="xs"
            variant={decision === entry.value ? 'default' : 'ghost'}
            className={cn(
              'min-w-18',
              decision === 'block' &&
                entry.value === 'block' &&
                'border-destructive/40 bg-destructive text-destructive-foreground hover:bg-destructive/92'
            )}
            data-policy-decision={entry.value}
            onClick={() => onDecisionChange(entry.value)}
          >
            {t(entry.label)}
          </Button>
        ))}
      </div>

      {decision !== 'inherit' ? (
        <Button
          size="xs"
          variant="ghost"
          data-policy-action="reset"
          onClick={() => onDecisionChange('inherit')}
        >
          {t('Reset')}
        </Button>
      ) : null}
    </div>
  );
}
