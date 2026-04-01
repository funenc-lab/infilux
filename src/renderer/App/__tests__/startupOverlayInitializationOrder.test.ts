import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readAppSource(): string {
  return readFileSync(join(process.cwd(), 'src/renderer/App.tsx'), 'utf8');
}

describe('App startup overlay initialization order', () => {
  it('declares activeSelectedSubagent before reading it in startup blocking state initialization', () => {
    const source = readAppSource();
    const activeSelectedSubagentIndex = source.indexOf('const activeSelectedSubagent =');
    const pendingStartupBlockingKeysIndex = source.indexOf(
      'const [pendingStartupBlockingKeys, setPendingStartupBlockingKeys] = useState'
    );

    expect(activeSelectedSubagentIndex).toBeGreaterThanOrEqual(0);
    expect(pendingStartupBlockingKeysIndex).toBeGreaterThanOrEqual(0);
    expect(activeSelectedSubagentIndex).toBeLessThan(pendingStartupBlockingKeysIndex);
  });
});
