import { describe, expect, it, vi } from 'vitest';
import { readCompleteXtermTranscript } from '../xtermTranscriptReplay';

describe('readCompleteXtermTranscript', () => {
  it('assembles every UTF-8 page from the archive tail without truncating the transcript', async () => {
    const getTranscriptPage = vi
      .fn()
      .mockResolvedValueOnce({
        text: '🚀-tail',
        nextBeforeByteOffset: 6,
        totalBytes: 15,
        health: 'complete',
      })
      .mockResolvedValueOnce({
        text: 'first-',
        totalBytes: 15,
        health: 'complete',
      })
      .mockResolvedValueOnce({
        text: '🚀-tail',
        nextBeforeByteOffset: 6,
        totalBytes: 15,
        health: 'complete',
      });

    await expect(
      readCompleteXtermTranscript({
        getTranscriptPage,
        pageBytes: 9,
        sessionId: 'session-1',
      })
    ).resolves.toBe('first-🚀-tail');

    expect(getTranscriptPage).toHaveBeenNthCalledWith(1, {
      sessionId: 'session-1',
      maxBytes: 9,
    });
    expect(getTranscriptPage).toHaveBeenNthCalledWith(2, {
      sessionId: 'session-1',
      beforeByteOffset: 6,
      maxBytes: 9,
    });
    expect(getTranscriptPage).toHaveBeenNthCalledWith(3, {
      sessionId: 'session-1',
      maxBytes: 9,
    });
  });

  it('rejects a transcript page sequence with a broken byte cursor', async () => {
    const getTranscriptPage = vi
      .fn()
      .mockResolvedValueOnce({
        text: 'tail',
        nextBeforeByteOffset: 5,
        totalBytes: 9,
        health: 'complete',
      })
      .mockResolvedValueOnce({
        text: 'broken',
        nextBeforeByteOffset: 2,
        totalBytes: 9,
        health: 'complete',
      });

    await expect(
      readCompleteXtermTranscript({
        getTranscriptPage,
        pageBytes: 9,
        sessionId: 'session-1',
      })
    ).resolves.toBeUndefined();
  });

  it('rejects an archive that cannot confirm complete transcript health', async () => {
    const getTranscriptPage = vi.fn().mockResolvedValue({
      text: 'partial replay',
      totalBytes: 14,
      health: 'degraded',
    });

    await expect(
      readCompleteXtermTranscript({
        getTranscriptPage,
        pageBytes: 16,
        sessionId: 'session-1',
      })
    ).resolves.toBeUndefined();
  });

  it('accepts a confirmed empty transcript instead of treating it as unavailable', async () => {
    const getTranscriptPage = vi.fn().mockResolvedValue({
      text: '',
      totalBytes: 0,
      health: 'complete',
    });

    await expect(
      readCompleteXtermTranscript({
        getTranscriptPage,
        pageBytes: 16,
        sessionId: 'session-1',
      })
    ).resolves.toBe('');
  });

  it('rejects pages when the archive changes before the completed transcript is verified', async () => {
    const getTranscriptPage = vi
      .fn()
      .mockResolvedValueOnce({
        text: '🚀-tail',
        nextBeforeByteOffset: 6,
        totalBytes: 15,
        health: 'complete',
      })
      .mockResolvedValueOnce({
        text: 'first-',
        totalBytes: 15,
        health: 'complete',
      })
      .mockResolvedValueOnce({
        text: 'changed!',
        nextBeforeByteOffset: 6,
        totalBytes: 15,
        health: 'complete',
      });

    await expect(
      readCompleteXtermTranscript({
        getTranscriptPage,
        pageBytes: 9,
        sessionId: 'session-1',
      })
    ).resolves.toBeUndefined();
  });
});
