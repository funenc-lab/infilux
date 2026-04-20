import type { TerminalRenderer } from '@/stores/settings/types';

interface ResolveXtermRendererOptions {
  requestedRenderer: TerminalRenderer;
  preferCompatibilityRenderer?: boolean;
}

export function resolveXtermRenderer({
  requestedRenderer,
  preferCompatibilityRenderer = false,
}: ResolveXtermRendererOptions): TerminalRenderer {
  if (preferCompatibilityRenderer && requestedRenderer === 'webgl') {
    return 'dom';
  }

  return requestedRenderer;
}
