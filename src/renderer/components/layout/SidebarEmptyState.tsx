import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SidebarEmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  label?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function SidebarEmptyState({
  icon,
  title,
  description,
  label,
  meta,
  actions,
  className,
}: SidebarEmptyStateProps) {
  return (
    <div className={cn('w-full min-w-0 px-2.5 py-3.5', className)}>
      <div className="flex min-w-0 items-start gap-3">
        <div className="control-panel-muted mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--foreground)_4%,transparent)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          {label ? (
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground/90">
              {label}
            </p>
          ) : null}
          <h2
            className={cn(
              'text-[0.96875rem] font-semibold tracking-[-0.02em] text-foreground',
              label && 'mt-1'
            )}
          >
            {title}
          </h2>
          <p className="mt-1.5 max-w-[30ch] text-[0.78125rem] leading-[1.45] text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      {meta ? (
        <div className="mt-3 pl-12 text-[0.71875rem] leading-5 text-muted-foreground">{meta}</div>
      ) : null}

      {actions ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">{actions}</div>
      ) : null}
    </div>
  );
}
