import type { SessionRuntimeState } from '@shared/types';
import type { OutputState } from '@/stores/agentSessions';

export const INTERRUPT_OUTPUT_IDLE_SETTLE_MS = 250;

interface AgentTerminalInterruptKeyEventOptions {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

interface AgentTerminalInterruptIdleOptions {
  now: number;
  outputState: OutputState;
  runtimeState: SessionRuntimeState;
  lastInterruptRequestAt: number | null;
  lastOutputAt: number;
}

export function isAgentTerminalInterruptKeyEvent(
  options: AgentTerminalInterruptKeyEventOptions
): boolean {
  if (options.key === 'Escape') {
    return !options.ctrlKey && !options.metaKey && !options.altKey && !options.shiftKey;
  }

  return (
    options.ctrlKey &&
    !options.metaKey &&
    !options.altKey &&
    !options.shiftKey &&
    options.key.toLowerCase() === 'c'
  );
}

export function shouldForceAgentTerminalIdleAfterInterrupt(
  options: AgentTerminalInterruptIdleOptions
): boolean {
  if (options.lastInterruptRequestAt === null) {
    return false;
  }

  if (options.outputState !== 'outputting' || options.runtimeState !== 'live') {
    return false;
  }

  if (options.now - options.lastInterruptRequestAt < INTERRUPT_OUTPUT_IDLE_SETTLE_MS) {
    return false;
  }

  if (
    options.lastOutputAt > 0 &&
    options.now - options.lastOutputAt < INTERRUPT_OUTPUT_IDLE_SETTLE_MS
  ) {
    return false;
  }

  return true;
}
