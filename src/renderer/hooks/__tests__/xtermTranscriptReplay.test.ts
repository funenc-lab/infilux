import { describe, expect, it, vi } from 'vitest';
import { readLatestXtermTranscript } from '../xtermTranscriptReplay';

describe('readLatestXtermTranscript', () => {
  it('restores only the latest bounded archive page for automatic terminal recovery', async () => {
    const getTranscriptPage = vi
      .fn()
      .mockResolvedValueOnce({
        text: '🚀-tail',
        nextBeforeByteOffset: 6,
        totalBytes: 15,
        health: 'complete',
        initialParserState: 'text',
      })
      .mockResolvedValueOnce({
        text: 'first-',
        totalBytes: 15,
        health: 'complete',
        initialParserState: 'text',
      });

    await expect(
      readLatestXtermTranscript({
        getTranscriptPage,
        pageBytes: 9,
        sessionId: 'session-1',
      })
    ).resolves.toBe('🚀-tail');

    expect(getTranscriptPage).toHaveBeenCalledOnce();
    expect(getTranscriptPage).toHaveBeenCalledWith({
      sessionId: 'session-1',
      maxBytes: 9,
      terminalReplay: true,
    });
  });

  it('drops an ANSI string remainder when the archive page begins inside it', async () => {
    const getTranscriptPage = vi.fn().mockResolvedValue({
      text: '0;Infilux\x07prompt ready\n',
      totalBytes: 24,
      health: 'complete',
      initialParserState: 'osc',
    });

    await expect(
      readLatestXtermTranscript({
        getTranscriptPage,
        pageBytes: 128,
        sessionId: 'session-1',
      })
    ).resolves.toBe('prompt ready\n');
  });

  it('rejects an archive that cannot confirm complete transcript health', async () => {
    const getTranscriptPage = vi.fn().mockResolvedValue({
      text: 'partial replay',
      totalBytes: 14,
      health: 'degraded',
    });

    await expect(
      readLatestXtermTranscript({
        getTranscriptPage,
        pageBytes: 16,
        sessionId: 'session-1',
      })
    ).resolves.toBeUndefined();
  });

  it('uses a bounded fallback when the archive cannot provide the latest page', async () => {
    const latest = '🚀latest';
    const fallbackReplay = `discarded-${'你'.repeat(50_000)}${latest}`;
    const getTranscriptPage = vi.fn().mockResolvedValue({
      text: 'partial replay',
      totalBytes: 131072,
      health: 'degraded',
    });
    const request = {
      fallbackReplay,
      getTranscriptPage,
      pageBytes: 16,
      sessionId: 'session-1',
    };

    const replay = await readLatestXtermTranscript(request);

    expect(replay).toMatch(/🚀latest$/u);
    expect(new TextEncoder().encode(replay).byteLength).toBeLessThanOrEqual(128 * 1024);
  });

  it('accepts a confirmed empty transcript instead of treating it as unavailable', async () => {
    const getTranscriptPage = vi.fn().mockResolvedValue({
      text: '',
      totalBytes: 0,
      health: 'complete',
      initialParserState: 'text',
    });

    await expect(
      readLatestXtermTranscript({
        getTranscriptPage,
        pageBytes: 16,
        sessionId: 'session-1',
      })
    ).resolves.toBe('');
  });

  it('does not request an archive page for an invalid recovery budget', async () => {
    const getTranscriptPage = vi.fn();

    await expect(
      readLatestXtermTranscript({
        getTranscriptPage,
        pageBytes: 0,
        sessionId: 'session-1',
      })
    ).resolves.toBeUndefined();

    expect(getTranscriptPage).not.toHaveBeenCalled();
  });
});
