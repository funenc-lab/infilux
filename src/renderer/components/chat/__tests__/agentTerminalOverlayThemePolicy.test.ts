import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentTerminalSource = readFileSync(resolve(currentDir, '../AgentTerminal.tsx'), 'utf8');
const globalsSource = readFileSync(resolve(currentDir, '../../../styles/globals.css'), 'utf8');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readCssRuleBody(selector: string): string {
  const pattern = new RegExp(`${escapeRegExp(selector)}\\s*\\{([\\s\\S]*?)\\n  \\}`);
  const match = globalsSource.match(pattern);

  expect(match).not.toBeNull();

  return match?.[1] ?? '';
}

describe('agent terminal overlay theme policy', () => {
  it('uses the shared themed overlay when remote terminals disconnect', () => {
    expect(agentTerminalSource).not.toContain('bg-background/70 backdrop-blur-sm');
    expect(agentTerminalSource).toContain(
      'bg-[color:color-mix(in_oklch,var(--background)_56%,transparent)] backdrop-blur-[1px]'
    );
  });

  it('uses a polite themed startup overlay for active loading terminals', () => {
    expect(agentTerminalSource).toContain('data-agent-terminal-startup-overlay="true"');
    expect(agentTerminalSource).toContain('role="status"');
    expect(agentTerminalSource).toContain('aria-live="polite"');
    expect(agentTerminalSource).toContain('absolute inset-0 z-10 flex items-center justify-center');
    expect(agentTerminalSource).toContain('control-panel-muted agent-terminal-startup-banner');
    expect(agentTerminalSource).toContain('agent-terminal-startup-dot');
    expect(agentTerminalSource).toContain('motion-safe:animate-pulse motion-reduce:animate-none');
    expect(agentTerminalSource).toContain('ui-type-body-sm mt-0.5 truncate font-semibold');
    expect(agentTerminalSource).toContain('ui-type-meta mt-0.5 truncate text-muted-foreground/70');
    expect(agentTerminalSource).not.toContain('data-agent-terminal-startup-progress="true"');
    expect(agentTerminalSource).not.toContain('data-agent-terminal-startup-step=');
    expect(agentTerminalSource).not.toContain('border-b-transparent border-r-transparent');
  });

  it('keeps startup loading styling aligned with console status tokens', () => {
    const bannerRule = readCssRuleBody('.agent-terminal-startup-banner');
    const indicatorRule = readCssRuleBody('.agent-terminal-startup-indicator-shell');
    const dotRule = readCssRuleBody('.agent-terminal-startup-dot');

    expect(bannerRule).toContain('var(--control-surface-muted)');
    expect(bannerRule).not.toContain('linear-gradient');
    expect(indicatorRule).toContain('var(--control-live)');
    expect(dotRule).toContain('var(--control-live)');
    expect(indicatorRule).not.toContain('var(--primary)');
    expect(dotRule).not.toContain('var(--primary)');
    expect(globalsSource).not.toContain('.agent-terminal-startup-banner::before');
  });
});
