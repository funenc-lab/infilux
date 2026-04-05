const NATIVE_TERMINAL_INPUT_AGENT_IDS = new Set(['claude', 'codex']);

export function getAgentInputBaseId(agentId: string): string {
  return agentId.replace(/-(hapi|happy)$/, '');
}

export function supportsAgentNativeTerminalInput(agentId: string): boolean {
  return NATIVE_TERMINAL_INPUT_AGENT_IDS.has(getAgentInputBaseId(agentId));
}
