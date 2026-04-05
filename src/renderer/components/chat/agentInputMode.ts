import { supportsAgentNativeTerminalInput } from '@shared/utils/agentInputMode';

export {
  getAgentInputBaseId,
  supportsAgentNativeTerminalInput,
} from '@shared/utils/agentInputMode';

export function supportsAgentEnhancedInput(agentId: string): boolean {
  return !supportsAgentNativeTerminalInput(agentId);
}
