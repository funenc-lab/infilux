export interface AgentTerminalRendererPolicyInput {
  isCanvasDisplayMode: boolean;
  mountedTerminalCount: number;
}

export function shouldPreferAgentTerminalCompatibilityRenderer({
  isCanvasDisplayMode,
  mountedTerminalCount,
}: AgentTerminalRendererPolicyInput): boolean {
  return !isCanvasDisplayMode || mountedTerminalCount <= 1;
}
