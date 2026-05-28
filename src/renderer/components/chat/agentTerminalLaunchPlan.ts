import type { PersistentAgentRuntimeState } from '@shared/types';
import type { XtermSessionCreateFallbackOptions } from '@/hooks/useXterm';
import {
  type AgentLaunchCommand,
  type BuildAgentLaunchPlanParams,
  buildAgentLaunchPlan,
} from './agentLaunchPlan';

export interface AgentTerminalLaunchPlanInput extends BuildAgentLaunchPlanParams {
  isReadOnlyTranscript: boolean;
  recoveryState?: PersistentAgentRuntimeState;
  shouldBypassHostSessionRecovery: boolean;
  onHostlessRetry: () => void;
}

export interface AgentTerminalLaunchPlanResult {
  command?: AgentLaunchCommand & {
    fallbackCommand?: AgentLaunchCommand;
  };
  env?: Record<string, string>;
  initialCommand?: string;
  hostSession?: ReturnType<typeof buildAgentLaunchPlan>['hostSession'];
  sessionCreateFallback?: XtermSessionCreateFallbackOptions;
}

function toXtermCommand(
  command: AgentLaunchCommand | undefined,
  fallbackCommand: AgentLaunchCommand | undefined
): AgentTerminalLaunchPlanResult['command'] {
  return command ? { ...command, fallbackCommand } : undefined;
}

export function resolveAgentTerminalLaunchPlan({
  isReadOnlyTranscript,
  recoveryState,
  shouldBypassHostSessionRecovery,
  onHostlessRetry,
  ...launchParams
}: AgentTerminalLaunchPlanInput): AgentTerminalLaunchPlanResult {
  if (isReadOnlyTranscript) {
    return {};
  }

  const persistentHostSessionAvailable =
    !shouldBypassHostSessionRecovery && recoveryState !== 'missing-host-session';
  const primaryPlan = buildAgentLaunchPlan({
    ...launchParams,
    persistentHostSessionAvailable,
  });

  let sessionCreateFallback: XtermSessionCreateFallbackOptions | undefined;
  if (persistentHostSessionAvailable && primaryPlan.hostSession?.kind === 'tmux') {
    const hostlessPlan = buildAgentLaunchPlan({
      ...launchParams,
      persistentHostSessionAvailable: false,
    });

    if ((hostlessPlan.command || hostlessPlan.initialCommand) && !hostlessPlan.hostSession) {
      sessionCreateFallback = {
        command: toXtermCommand(hostlessPlan.command, hostlessPlan.fallbackCommand),
        env: hostlessPlan.env,
        initialCommand: hostlessPlan.initialCommand,
        hostSession: undefined,
        onRetry: onHostlessRetry,
      };
    }
  }

  return {
    command: toXtermCommand(primaryPlan.command, primaryPlan.fallbackCommand),
    env: primaryPlan.env,
    initialCommand: primaryPlan.initialCommand,
    hostSession: primaryPlan.hostSession,
    sessionCreateFallback,
  };
}
