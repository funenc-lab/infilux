import type { SessionKind } from '@shared/types';
import type { Terminal } from '@xterm/xterm';

const AGENT_ALT_SCREEN_PRIVATE_MODES = new Set([47, 1047, 1049]);
const AGENT_MOUSE_PRIVATE_MODES = new Set([1000, 1002, 1003, 1005, 1006, 1015, 1016]);

function flattenPrivateModeParams(params: readonly (number | number[])[]): number[] {
  const flattened: number[] = [];

  for (const param of params) {
    if (Array.isArray(param)) {
      flattened.push(...param);
      continue;
    }
    flattened.push(param);
  }

  return flattened;
}

export function shouldSuppressAgentAlternateScreenSwitch(
  params: readonly (number | number[])[]
): boolean {
  return flattenPrivateModeParams(params).some((param) =>
    AGENT_ALT_SCREEN_PRIVATE_MODES.has(param)
  );
}

export function shouldSuppressAgentMouseTrackingSwitch(
  params: readonly (number | number[])[]
): boolean {
  return flattenPrivateModeParams(params).some((param) => AGENT_MOUSE_PRIVATE_MODES.has(param));
}

export function shouldSuppressAgentPrivateModeSwitch(
  params: readonly (number | number[])[]
): boolean {
  return (
    shouldSuppressAgentAlternateScreenSwitch(params) ||
    shouldSuppressAgentMouseTrackingSwitch(params)
  );
}

export function attachAgentTranscriptMode(
  terminal: Pick<Terminal, 'parser'>,
  kind: SessionKind
): { dispose: () => void } | null {
  if (kind !== 'agent') {
    return null;
  }

  const suppressPrivateModes = (params: readonly (number | number[])[]) =>
    shouldSuppressAgentPrivateModeSwitch(params);

  const disposables = [
    terminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, suppressPrivateModes),
    terminal.parser.registerCsiHandler({ prefix: '?', final: 'l' }, suppressPrivateModes),
  ];

  return {
    dispose() {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    },
  };
}
