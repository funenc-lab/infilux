import { motion } from 'framer-motion';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { AgentActivityState } from '@/stores/worktreeActivity';

interface ActivityIndicatorProps {
  state: AgentActivityState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: {
    runningBlock: 'h-1.5 w-2.5',
    statusBlock: 'h-1.5 w-2',
    gap: 'gap-0.5',
  },
  md: {
    runningBlock: 'h-2 w-3',
    statusBlock: 'h-2 w-2.5',
    gap: 'gap-0.5',
  },
  lg: {
    runningBlock: 'h-2.5 w-3.5',
    statusBlock: 'h-2.5 w-3',
    gap: 'gap-0.75',
  },
};

const colorClasses: Record<AgentActivityState, string> = {
  idle: '',
  running: 'bg-[color:var(--control-live)]',
  waiting_input: 'bg-[color:var(--control-wait)]',
  completed: 'bg-[color:var(--control-done)]',
};

const titleKeys: Record<AgentActivityState, string> = {
  idle: '',
  running: 'Agent is running',
  waiting_input: 'Waiting for user input',
  completed: 'Task completed',
};

type ActivityPattern = 'sequence' | 'pulse' | 'static';

interface ActivityVisualConfig {
  pattern: ActivityPattern;
  animated: boolean;
  blockCount: number;
  blockVariant: 'runningBlock' | 'statusBlock';
  duration?: number;
  delayStep?: number;
  opacityFrames?: number[];
  xFrames?: number[];
}

const visualConfig: Record<Exclude<AgentActivityState, 'idle'>, ActivityVisualConfig> = {
  running: {
    pattern: 'sequence',
    animated: true,
    blockCount: 2,
    blockVariant: 'runningBlock',
    duration: 0.78,
    delayStep: 0.14,
    opacityFrames: [0.3, 1, 0.3],
    xFrames: [0, 1.2, 0],
  },
  waiting_input: {
    pattern: 'pulse',
    animated: true,
    blockCount: 1,
    blockVariant: 'statusBlock',
    duration: 1.9,
    delayStep: 0,
    opacityFrames: [0.38, 0.78, 0.38],
  },
  completed: {
    pattern: 'static',
    animated: false,
    blockCount: 1,
    blockVariant: 'statusBlock',
  },
};

/**
 * Activity indicator built from compact signal bars.
 * - running: green flowing sequence
 * - waiting_input: amber slow pulse
 * - completed: blue static bar
 * - idle: hidden
 */
export function ActivityIndicator({ state, size = 'md', className }: ActivityIndicatorProps) {
  const { t } = useI18n();

  if (state === 'idle') return null;

  const config = visualConfig[state];
  const title = titleKeys[state] ? t(titleKeys[state]) : '';
  const sizeConfig = sizeClasses[size];
  const blockClassName = sizeConfig[config.blockVariant];
  const blockKeys = config.blockCount === 2 ? ['leading', 'trailing'] : ['single'];

  return (
    <span
      data-slot="activity-indicator"
      data-state={state}
      data-pattern={config.pattern}
      data-animated={config.animated ? 'true' : 'false'}
      className={cn('inline-flex shrink-0 items-center', sizeConfig.gap, className)}
      title={title}
    >
      {blockKeys.map((blockKey, index) => (
        <motion.span
          key={`${state}-${blockKey}`}
          data-slot="activity-indicator-block"
          className={cn('block rounded-[0.2rem]', blockClassName, colorClasses[state])}
          animate={
            config.animated
              ? {
                  opacity: config.opacityFrames,
                  ...(config.xFrames ? { x: config.xFrames } : {}),
                }
              : undefined
          }
          transition={
            config.animated
              ? {
                  duration: config.duration,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                  delay: index * (config.delayStep ?? 0),
                }
              : undefined
          }
        />
      ))}
    </span>
  );
}
