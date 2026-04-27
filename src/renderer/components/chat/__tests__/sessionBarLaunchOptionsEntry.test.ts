import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const sessionBarSource = readFileSync(resolve(currentDir, '../SessionBar.tsx'), 'utf8');

describe('SessionBar launch options entry', () => {
  it('exposes a launch-options callback for session creation menus', () => {
    expect(sessionBarSource).toContain(
      'onOpenLaunchOptions?: (agentId: string, agentCommand: string) => void;'
    );
  });

  it('shows a dedicated Skill & MCP entry only for supported capability agents', () => {
    expect(sessionBarSource).toContain("aria-label={t('Skill & MCP')}");
    expect(sessionBarSource).toContain('supportsAgentCapabilityPolicyLaunch(');
    expect(sessionBarSource).toContain('onOpenLaunchOptions?.(agentId, info.command);');
  });
});
