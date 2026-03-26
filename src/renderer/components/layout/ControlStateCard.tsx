import type { ReactNode } from 'react';
import { ConsoleEmptyState } from '@/components/layout/ConsoleEmptyState';
import { cn } from '@/lib/utils';

type ControlStateTone = 'default' | 'strong' | 'live' | 'wait' | 'done';

interface ControlStateCardProps {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  chipLabel?: string;
  chipTone?: ControlStateTone;
  actions?: ReactNode;
  className?: string;
  cardClassName?: string;
}

export function ControlStateCard({
  icon,
  eyebrow,
  title,
  description,
  chipLabel,
  chipTone = 'default',
  actions,
  className,
  cardClassName,
}: ControlStateCardProps) {
  return (
    <div
      className={cn('flex h-full items-start justify-center px-6 pb-6 pt-12 sm:pt-16', className)}
    >
      <ConsoleEmptyState
        className={cn('max-w-[min(60rem,100%)]', cardClassName)}
        icon={icon}
        eyebrow={eyebrow}
        title={title}
        description={description}
        chips={chipLabel ? [{ label: chipLabel, tone: chipTone }] : []}
        actions={actions}
      />
    </div>
  );
}
