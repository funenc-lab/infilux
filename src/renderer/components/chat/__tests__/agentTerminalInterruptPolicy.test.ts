import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  INTERRUPT_OUTPUT_IDLE_SETTLE_MS,
  isAgentTerminalInterruptKeyEvent,
  shouldForceAgentTerminalIdleAfterInterrupt,
} from '../agentTerminalInterruptPolicy';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');

describe('agentTerminalInterruptPolicy', () => {
  it('treats ctrl+c and escape as explicit interrupt intents', () => {
    expect(
      isAgentTerminalInterruptKeyEvent({
        key: 'c',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      })
    ).toBe(true);

    expect(
      isAgentTerminalInterruptKeyEvent({
        key: 'Escape',
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      })
    ).toBe(true);
  });

  it('does not confuse copy shortcuts or modified escape chords for agent interrupts', () => {
    expect(
      isAgentTerminalInterruptKeyEvent({
        key: 'c',
        ctrlKey: false,
        metaKey: true,
        altKey: false,
        shiftKey: false,
      })
    ).toBe(false);

    expect(
      isAgentTerminalInterruptKeyEvent({
        key: 'Escape',
        ctrlKey: false,
        metaKey: false,
        altKey: true,
        shiftKey: false,
      })
    ).toBe(false);
  });

  it('forces outputting sessions back to idle after an explicit interrupt settles with no fresh output', () => {
    const now = 10_000;

    expect(
      shouldForceAgentTerminalIdleAfterInterrupt({
        now,
        outputState: 'outputting',
        runtimeState: 'live',
        lastInterruptRequestAt: now - INTERRUPT_OUTPUT_IDLE_SETTLE_MS,
        lastOutputAt: now - INTERRUPT_OUTPUT_IDLE_SETTLE_MS,
      })
    ).toBe(true);
  });

  it('keeps sessions outputting when fresh output continues after the interrupt attempt', () => {
    const now = 10_000;

    expect(
      shouldForceAgentTerminalIdleAfterInterrupt({
        now,
        outputState: 'outputting',
        runtimeState: 'live',
        lastInterruptRequestAt: now - INTERRUPT_OUTPUT_IDLE_SETTLE_MS,
        lastOutputAt: now - 25,
      })
    ).toBe(false);
  });

  it('wires the interrupt fallback into AgentTerminal instead of leaving it as a dead helper', () => {
    expect(agentTerminalSource).toContain('isAgentTerminalInterruptKeyEvent');
    expect(agentTerminalSource).toContain('shouldForceAgentTerminalIdleAfterInterrupt');
    expect(agentTerminalSource).toContain('lastInterruptRequestAtRef');
  });
});
