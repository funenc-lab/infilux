import type { AppRuntimeChannel } from '@shared/utils/runtimeIdentity';

export const DEV_RENDERER_ERROR_AUTO_RECOVERY_COOLDOWN_MS = 30_000;

const REACT_HOOK_ORDER_ERROR_PATTERNS = [
  'change in the order of Hooks',
  'Should have a queue',
  'calling Hooks conditionally',
  'invalid-hook-call',
];
const REACT_HOOK_STATE_CORRUPTION_ERROR_PATTERNS = [
  "Cannot read properties of undefined (reading 'key')",
];
const DEV_AGENT_SESSION_RECOVERY_COMPONENTS = ['AgentPanel', 'AgentTerminal'];

export function formatErrorBoundaryMessage(error: unknown): string {
  if (error instanceof Error) {
    const label = error.name?.trim() || 'Error';
    const message = error.message?.trim();
    return message ? `${label}: ${message}` : label;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return 'Unknown renderer error';
}

export function buildRendererErrorAutoRecoverySignature({
  componentStack,
  errorMessage,
}: {
  componentStack?: string | null;
  errorMessage: string;
}): string {
  const firstComponentFrame =
    componentStack
      ?.split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('at ')) ?? 'unknown-component';

  return `${errorMessage.trim()}|${firstComponentFrame}`;
}

function isReactHookOrderError(errorMessage: string): boolean {
  return [...REACT_HOOK_ORDER_ERROR_PATTERNS, ...REACT_HOOK_STATE_CORRUPTION_ERROR_PATTERNS].some(
    (pattern) => errorMessage.includes(pattern)
  );
}

export function shouldAutoRecoverRendererError({
  componentStack,
  errorMessage,
  lastRecoveryAttemptedAt,
  now,
  runtimeChannel,
}: {
  componentStack?: string | null;
  errorMessage: string;
  lastRecoveryAttemptedAt: number | null;
  now: number;
  runtimeChannel: AppRuntimeChannel;
}): boolean {
  if (runtimeChannel !== 'dev') {
    return false;
  }

  if (!isReactHookOrderError(errorMessage)) {
    return false;
  }

  if (
    !DEV_AGENT_SESSION_RECOVERY_COMPONENTS.some((componentName) =>
      componentStack?.includes(componentName)
    )
  ) {
    return false;
  }

  if (
    lastRecoveryAttemptedAt !== null &&
    now - lastRecoveryAttemptedAt < DEV_RENDERER_ERROR_AUTO_RECOVERY_COOLDOWN_MS
  ) {
    return false;
  }

  return true;
}
