import type { Terminal } from '@xterm/xterm';

const ORIGINAL_RESET_SYMBOL = Symbol('xterm-original-reset');

type TerminalWheelHandler = Parameters<Terminal['attachCustomWheelEventHandler']>[0];

type PersistentWheelTerminal = Terminal & {
  _customWheelEventHandler?: TerminalWheelHandler;
  [ORIGINAL_RESET_SYMBOL]?: Terminal['reset'];
};

/**
 * Keep the custom wheel handler attached even when the terminal performs a full reset.
 *
 * xterm preserves the custom key handler across reset(), but clears the custom wheel handler.
 * Agent TUIs such as Codex can emit reset sequences during startup or screen transitions,
 * so we need to restore the wheel handler automatically after each reset.
 */
export function attachPersistentCustomWheelEventHandler(
  terminal: Terminal,
  handler: TerminalWheelHandler
): void {
  const patchableTerminal = terminal as PersistentWheelTerminal;

  if (!patchableTerminal[ORIGINAL_RESET_SYMBOL]) {
    const originalReset = terminal.reset.bind(terminal);
    patchableTerminal[ORIGINAL_RESET_SYMBOL] = originalReset;

    terminal.reset = () => {
      const activeWheelHandler = patchableTerminal._customWheelEventHandler;
      originalReset();
      if (activeWheelHandler) {
        terminal.attachCustomWheelEventHandler(activeWheelHandler);
      }
    };
  }

  terminal.attachCustomWheelEventHandler(handler);
}
