import { AI_PROVIDER_CATALOG, AI_PROVIDERS } from '@shared/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerTestDoubles = vi.hoisted(() => {
  const spawn = vi.fn();
  const spawnSync = vi.fn();
  const stdin = {
    end: vi.fn(),
    on: vi.fn(),
    write: vi.fn(),
  };
  const proc = {
    on: vi.fn(),
    pid: 1234,
    stdin,
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  };

  function reset() {
    spawn.mockReset();
    spawn.mockReturnValue(proc);
    spawnSync.mockReset();
    proc.on.mockReset();
    proc.stdout.on.mockReset();
    proc.stderr.on.mockReset();
    stdin.end.mockReset();
    stdin.on.mockReset();
    stdin.write.mockReset();
  }

  return {
    proc,
    reset,
    spawn,
    spawnSync,
    stdin,
  };
});

vi.mock('node:child_process', () => ({
  spawn: providerTestDoubles.spawn,
  spawnSync: providerTestDoubles.spawnSync,
}));

vi.mock('../../../utils/shell', () => ({
  getEnvForCommand: vi.fn(() => ({ PATH: '/mock/bin' })),
}));

describe('AI CLI providers', () => {
  beforeEach(() => {
    providerTestDoubles.reset();
  });

  it('spawns provider CLIs directly instead of building a shell command string', async () => {
    const { spawnCLI } = await import('../providers');

    spawnCLI({
      cwd: '/repo',
      model: 'gpt-5.2',
      outputFormat: 'json',
      prompt: 'Generate JSON',
      provider: 'codex-cli',
      reasoningEffort: 'medium',
    });

    expect(providerTestDoubles.spawn).toHaveBeenCalledWith(
      'codex',
      ['exec', '-m', 'gpt-5.2', '-c', 'reasoning_effort="medium"'],
      expect.objectContaining({
        cwd: '/repo',
        env: { PATH: '/mock/bin' },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    );
    expect(providerTestDoubles.stdin.write).toHaveBeenCalledWith('Generate JSON');
    expect(providerTestDoubles.stdin.end).toHaveBeenCalledTimes(1);
  });

  it('keeps the provider adapter registry aligned with shared provider IDs', async () => {
    const { AI_PROVIDER_ADAPTERS } = await import('../providers');

    expect(Object.keys(AI_PROVIDER_ADAPTERS).sort()).toEqual([...AI_PROVIDERS].sort());

    for (const provider of AI_PROVIDERS) {
      expect(AI_PROVIDER_ADAPTERS[provider]).toMatchObject({
        buildArgs: expect.any(Function),
        command: AI_PROVIDER_CATALOG[provider].command,
        parseOutput: expect.any(Function),
      });
    }
  });
});
