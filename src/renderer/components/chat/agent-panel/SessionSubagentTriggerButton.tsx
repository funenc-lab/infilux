import { CornerDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SessionSubagentTriggerButtonProps {
  count?: number;
  isActive?: boolean;
  className?: string;
  title: string;
  ariaLabel?: string;
  onClick: () => void;
}

export function SessionSubagentTriggerButton({
  count = 0,
  isActive = false,
  className,
  title,
  ariaLabel,
  onClick,
}: SessionSubagentTriggerButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      data-session-subagent-trigger="true"
      data-active={isActive ? 'true' : 'false'}
      data-has-count={count > 0 ? 'true' : 'false'}
      className={cn(
        className,
        count > 0 &&
          !isActive &&
          'text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_22%,transparent)]',
        isActive && 'control-icon-button-active'
      )}
      onClick={onClick}
    >
      <span className="relative">
        <CornerDownRight className="h-4 w-4" />
        {count > 0 ? (
          <span className="pointer-events-none absolute -right-2 -top-2 flex min-w-4 items-center justify-center rounded-full border border-background/80 bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground shadow-[0_0_0_2px_var(--background)]">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </span>
    </button>
  );
}
