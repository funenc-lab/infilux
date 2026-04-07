import type { Terminal } from '@xterm/xterm';

const WHEEL_LISTENER_SYMBOL = Symbol('xterm-wheel-listener');
const WHEEL_HANDLER_SYMBOL = Symbol('xterm-wheel-handler');

type TerminalWheelHandler = Parameters<Terminal['attachCustomWheelEventHandler']>[0];

type PersistentWheelTerminal = Terminal & {
  [WHEEL_LISTENER_SYMBOL]?: EventListener;
  [WHEEL_HANDLER_SYMBOL]?: TerminalWheelHandler;
};

/**
 * Route wheel events through a stable DOM listener instead of xterm's custom wheel API.
 *
 * xterm only invokes `attachCustomWheelEventHandler` while mouse reporting is enabled.
 * Agent TUIs often disable mouse reporting exactly when we need scroll remapping, so we
 * attach to the root terminal element directly and swap the active policy callback in place.
 */
export function attachPersistentCustomWheelEventHandler(
  terminal: Terminal,
  handler: TerminalWheelHandler
): void {
  const patchableTerminal = terminal as PersistentWheelTerminal;
  const terminalElement = terminal.element;
  if (!terminalElement) {
    return;
  }

  if (patchableTerminal[WHEEL_LISTENER_SYMBOL]) {
    terminalElement.removeEventListener('wheel', patchableTerminal[WHEEL_LISTENER_SYMBOL]);
  }

  patchableTerminal[WHEEL_HANDLER_SYMBOL] = handler;

  const wheelListener: EventListener = (event) => {
    const activeHandler = patchableTerminal[WHEEL_HANDLER_SYMBOL];
    if (!activeHandler) {
      return;
    }

    activeHandler(event as WheelEvent);
  };

  patchableTerminal[WHEEL_LISTENER_SYMBOL] = wheelListener;
  terminalElement.addEventListener('wheel', wheelListener, {
    passive: false,
  });
}
