import type { ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ControlStateActionDensity = 'default' | 'compact';

type ControlStateActionButtonProps = Omit<ComponentProps<typeof Button>, 'size' | 'variant'> & {
  density?: ControlStateActionDensity;
};

const CONTROL_STATE_ACTION_BUTTON_BASE_CLASSNAME =
  'control-action-button control-action-button-primary min-w-0 rounded-xl px-4 font-semibold tracking-[-0.01em]';

const CONTROL_STATE_ACTION_BUTTON_DENSITY_CLASSNAME: Record<ControlStateActionDensity, string> = {
  default: 'text-[15px]',
  compact: 'text-sm',
};

export function ControlStateActionButton({
  density = 'default',
  className,
  ...props
}: ControlStateActionButtonProps) {
  return (
    <Button
      variant="default"
      size={density === 'compact' ? 'sm' : 'lg'}
      className={cn(
        CONTROL_STATE_ACTION_BUTTON_BASE_CLASSNAME,
        CONTROL_STATE_ACTION_BUTTON_DENSITY_CLASSNAME[density],
        className
      )}
      {...props}
    />
  );
}
