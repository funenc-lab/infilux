import { motion } from 'framer-motion';
import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

export type GlowState = 'idle' | 'running' | 'waiting_input' | 'completed';

/**
 * Hook to check if glow effect is enabled (Beta feature)
 */
export function useGlowEffectEnabled(): boolean {
  return useSettingsStore((s) => s.glowEffectEnabled);
}

interface GlowCardProps extends HTMLAttributes<HTMLElement> {
  state: GlowState;
  children: ReactNode;
  as?: 'div' | 'button';
  animated?: boolean;
}

/**
 * GlowCard keeps the legacy API but renders a quieter state treatment that
 * matches the console visual system.
 */
export const GlowCard = forwardRef<HTMLElement, GlowCardProps>(
  ({ state, children, className, as = 'div', animated = false, ...restProps }, ref) => {
    const Component = as === 'button' ? 'button' : 'div';

    return (
      <Component
        ref={ref as React.Ref<HTMLDivElement & HTMLButtonElement>}
        className={cn('relative overflow-hidden', className)}
        {...restProps}
      >
        {/* Quiet state layer */}
        {state === 'running' && <RunningGlow animated={animated} />}
        {state === 'waiting_input' && <WaitingInputGlow animated={animated} />}
        {state === 'completed' && <CompletedGlow animated={animated} />}

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
      {state === 'running' && <RunningGlow animated={false} />}
      {state === 'waiting_input' && <WaitingInputGlow animated={false} />}
      {state === 'completed' && <CompletedGlow animated={false} />}

      {/* Content - above glow background */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * Running state frame
 */
function RunningGlow({ animated }: { animated: boolean }) {
  return animated ? (
    <motion.div
      className="absolute inset-0 rounded-[inherit] border pointer-events-none"
      style={{
        borderColor: 'color-mix(in oklch, var(--control-live) 42%, transparent)',
        background: 'color-mix(in oklch, var(--control-live) 8%, var(--background) 92%)',
      }}
      animate={{
        opacity: [0.68, 0.92, 0.68],
      }}
      transition={{
        duration: 2.4,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeOut',
      }}
    />
  ) : (
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
function WaitingInputGlow({ animated }: { animated: boolean }) {
  return animated ? (
    <motion.div
      className="absolute inset-0 rounded-[inherit] border pointer-events-none"
      style={{
        borderColor: 'color-mix(in oklch, var(--control-wait) 46%, transparent)',
        background: 'color-mix(in oklch, var(--control-wait) 10%, var(--background) 90%)',
      }}
      animate={{
        opacity: [0.72, 1, 0.72],
      }}
      transition={{
        duration: 2.8,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeOut',
      }}
    />
  ) : (
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
function CompletedGlow({ animated }: { animated: boolean }) {
  return animated ? (
    <motion.div
      className="absolute inset-0 rounded-[inherit] border pointer-events-none"
      style={{
        borderColor: 'color-mix(in oklch, var(--control-done) 40%, transparent)',
        background: 'color-mix(in oklch, var(--control-done) 9%, var(--background) 91%)',
      }}
      animate={{
        opacity: [0.72, 0.9, 0.72],
      }}
      transition={{
        duration: 2.6,
        repeat: Number.POSITIVE_INFINITY,
        ease: 'easeOut',
      }}
    />
  ) : (
    <div
      className="absolute inset-0 rounded-[inherit] border pointer-events-none"
      style={{
        borderColor: 'color-mix(in oklch, var(--control-done) 30%, var(--border) 70%)',
        background: 'color-mix(in oklch, var(--control-done) 6%, var(--background) 94%)',
      }}
    />
  );
}
