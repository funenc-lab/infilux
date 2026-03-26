import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

export type GlowState = 'idle' | 'running' | 'waiting_input' | 'completed';

/**
 * Hook to check if glow effect is enabled (Beta feature)
 */
export function useGlowEffectEnabled(): boolean {
  return useSettingsStore((s) => s.glowEffectEnabled);
}

interface GlowCardProps {
  state: GlowState;
  children: ReactNode;
  className?: string;
  as?: 'div' | 'button';
  onClick?: () => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  tabIndex?: number;
  role?: string;
  title?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * GlowCard keeps the legacy API but renders a quieter state treatment that
 * matches the console visual system.
 */
export const GlowCard = forwardRef<HTMLDivElement, GlowCardProps>(
  (
    {
      state,
      children,
      className,
      as = 'div',
      onClick,
      onDoubleClick,
      onContextMenu,
      onKeyDown,
      tabIndex,
      role,
      title,
      draggable,
      onDragStart,
      onDragEnd,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    ref
  ) => {
    const Component = as === 'button' ? 'button' : 'div';

    return (
      <Component
        ref={ref as React.Ref<HTMLDivElement & HTMLButtonElement>}
        className={cn('relative overflow-hidden', className)}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        tabIndex={tabIndex}
        role={role}
        title={title}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* Quiet state layer */}
        {state === 'running' && <RunningGlow />}
        {state === 'waiting_input' && <WaitingInputGlow />}
        {state === 'completed' && <CompletedGlow />}

        {/* Content rendered directly to preserve flex layout, z-index applied via relative positioning */}
        {children}
      </Component>
    );
  }
);

GlowCard.displayName = 'GlowCard';

/**
 * State indicator dot for smaller UI elements
 */
export function GlowIndicator({
  state,
  size = 'md',
  className,
}: {
  state: GlowState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  if (state === 'idle') return null;

  const sizeClasses = {
    sm: 'h-1.5 w-1.5',
    md: 'h-2 w-2',
    lg: 'h-2.5 w-2.5',
  };

  const colorClasses: Record<GlowState, string> = {
    running: 'bg-[color:var(--control-live)]',
    waiting_input: 'bg-[color:var(--control-wait)]',
    completed: 'bg-[color:var(--control-done)]',
    idle: '',
  };

  return (
    <span
      className={cn(
        'inline-block rounded-full shrink-0',
        sizeClasses[size],
        colorClasses[state],
        className
      )}
      style={{
        opacity: state === 'running' ? 1 : 0.86,
        boxShadow:
          state === 'running'
            ? '0 0 0 1px color-mix(in oklch, var(--control-live) 22%, transparent)'
            : undefined,
      }}
      title={
        state === 'running'
          ? 'Claude is working'
          : state === 'waiting_input'
            ? 'Waiting for user input'
            : 'Task completed'
      }
    />
  );
}

/**
 * Lightweight state frame for tree items and list rows
 */
export function GlowBorder({
  state,
  children,
  className,
}: {
  state: GlowState;
  children: ReactNode;
  className?: string;
}) {
  if (state === 'idle') {
    return <div className={cn('relative', className)}>{children}</div>;
  }

  return (
    <div className={cn('relative', className)}>
      {/* Quiet state layer */}
      {state === 'running' && <RunningGlow />}
      {state === 'waiting_input' && <WaitingInputGlow />}
      {state === 'completed' && <CompletedGlow />}

      {/* Content - above glow background */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * Running state frame
 */
function RunningGlow() {
  return (
    <div
      className="absolute inset-0 rounded-[inherit] border pointer-events-none"
      style={{
        borderColor: 'color-mix(in oklch, var(--control-live) 32%, var(--border) 68%)',
        background: 'color-mix(in oklch, var(--control-live) 6%, var(--background) 94%)',
      }}
    />
  );
}

/**
 * Waiting state frame
 */
function WaitingInputGlow() {
  return (
    <div
      className="absolute inset-0 rounded-[inherit] border pointer-events-none"
      style={{
        borderColor: 'color-mix(in oklch, var(--control-wait) 34%, var(--border) 66%)',
        background: 'color-mix(in oklch, var(--control-wait) 7%, var(--background) 93%)',
      }}
    />
  );
}

/**
 * Completed state frame
 */
function CompletedGlow() {
  return (
    <div
      className="absolute inset-0 rounded-[inherit] border pointer-events-none"
      style={{
        borderColor: 'color-mix(in oklch, var(--control-done) 30%, var(--border) 70%)',
        background: 'color-mix(in oklch, var(--control-done) 6%, var(--background) 94%)',
      }}
    />
  );
}
