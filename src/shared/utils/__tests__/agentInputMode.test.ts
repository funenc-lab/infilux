import { describe, expect, it } from 'vitest';
import {
  getAgentInputBaseId,
  supportsAgentNativeTerminalInput,
  supportsProviderSessionResume,
} from '../agentInputMode';

describe('shared agent input mode helpers', () => {
  it('normalizes hapi and happy suffixes back to the base provider id', () => {
    expect(getAgentInputBaseId('claude-hapi')).toBe('claude');
    expect(getAgentInputBaseId('codex-happy')).toBe('codex');
    expect(getAgentInputBaseId('cursor')).toBe('cursor');
  });

  it('identifies native terminal input providers by their normalized agent ids', () => {
    expect(supportsAgentNativeTerminalInput('claude')).toBe(true);
    expect(supportsAgentNativeTerminalInput('claude-hapi')).toBe(true);
    expect(supportsAgentNativeTerminalInput('codex-happy')).toBe(true);
    expect(supportsAgentNativeTerminalInput('cursor')).toBe(false);
  });

  it('identifies commands with implemented provider session resume arguments', () => {
    expect(supportsProviderSessionResume('codex')).toBe(true);
    expect(supportsProviderSessionResume('claude')).toBe(true);
    expect(supportsProviderSessionResume('claude-hapi')).toBe(true);
    expect(supportsProviderSessionResume('cursor-agent')).toBe(true);
    expect(supportsProviderSessionResume('gemini')).toBe(false);
    expect(supportsProviderSessionResume('custom-agent')).toBe(false);
  });
});
