import { describe, expect, it } from 'vitest';
import { supportsAgentEnhancedInput, supportsAgentNativeTerminalInput } from '../agentInputMode';

describe('agentInputMode', () => {
  it('treats Claude and Codex variants as native terminal input providers', () => {
    expect(supportsAgentNativeTerminalInput('claude')).toBe(true);
    expect(supportsAgentNativeTerminalInput('claude-hapi')).toBe(true);
    expect(supportsAgentNativeTerminalInput('codex')).toBe(true);
    expect(supportsAgentNativeTerminalInput('codex-happy')).toBe(true);
  });

  it('keeps non-native providers on the enhanced input fallback path', () => {
    expect(supportsAgentNativeTerminalInput('gemini')).toBe(false);
    expect(supportsAgentEnhancedInput('gemini')).toBe(true);
    expect(supportsAgentEnhancedInput('cursor')).toBe(true);
  });
});
