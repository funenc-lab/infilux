import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

export const agentPanelSource = [
  readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8'),
  readFileSync(resolve(currentDir, '../agent-panel/AgentPanelEmptyState.tsx'), 'utf8'),
  readFileSync(resolve(currentDir, '../controlButtonStyles.ts'), 'utf8'),
].join('\n');
