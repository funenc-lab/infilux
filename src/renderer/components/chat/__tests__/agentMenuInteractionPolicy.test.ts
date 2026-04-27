import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { agentPanelSource } from './agentPanelSource';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentGroupSource = readFileSync(resolve(currentDir, '../AgentGroup.tsx'), 'utf8');
const agentGroupEmptyStateSource = readFileSync(
  resolve(currentDir, '../AgentGroupEmptyState.tsx'),
  'utf8'
);
const controlButtonStylesSource = readFileSync(
  resolve(currentDir, '../controlButtonStyles.ts'),
  'utf8'
);

describe('agent menu interaction policy', () => {
  it('uses click-triggered empty-state profile menus in AgentGroup', () => {
    expect(agentGroupSource).toContain('const agentMenuRef = useRef<HTMLDivElement>(null);');
    expect(agentGroupSource).toContain('<AgentGroupEmptyState');
    expect(agentGroupSource).toContain(
      "document.addEventListener('pointerdown', handlePointerDown)"
    );
    expect(agentGroupEmptyStateSource).toContain("aria-label={t('Choose session agent')}");
    expect(agentGroupSource).not.toContain('onMouseEnter={() => setShowAgentMenu(true)}');
    expect(agentGroupEmptyStateSource).not.toContain(
      'onMouseLeave={() => setShowAgentMenu(false)}'
    );
  });

  it('uses click-triggered empty-state profile menus in AgentPanel', () => {
    expect(agentPanelSource).toContain(
      'const emptyStateAgentMenuRef = useRef<HTMLDivElement>(null);'
    );
    expect(agentPanelSource).toContain(
      "document.addEventListener('pointerdown', handlePointerDown)"
    );
    expect(agentPanelSource).toContain("aria-label={t('Choose Profile')}");
    expect(agentPanelSource).not.toContain('onMouseEnter={() => setShowAgentMenu(true)}');
    expect(agentPanelSource).not.toContain('onMouseLeave={() => setShowAgentMenu(false)}');
  });

  it('keeps empty-state profile menu items shrink-safe so default chips do not overflow', () => {
    expect(controlButtonStylesSource).toContain(
      'control-menu-item flex w-full min-w-0 items-center gap-2'
    );
    expect(agentGroupEmptyStateSource).toContain('CHAT_MENU_ITEM_BASE_CLASS_NAME');
    expect(agentGroupEmptyStateSource).toContain('AGENT_GROUP_EMPTY_STATE_MENU_ITEM_CLASS_NAME');
    expect(agentGroupEmptyStateSource).toContain("'mt-0 flex-1 justify-start'");
    expect(agentPanelSource).toContain('flex w-full min-w-0 items-center gap-2');
    expect(agentGroupEmptyStateSource).not.toContain('whitespace-nowrap text-foreground');
    expect(agentPanelSource).not.toContain('text-foreground whitespace-nowrap');
  });
});
