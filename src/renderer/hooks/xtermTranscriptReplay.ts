import type { SessionTranscriptPage, SessionTranscriptPageRequest } from '@shared/types';
import { takeTerminalReplayByteTail } from '@shared/utils/terminalReplayTail';

export const XTERM_AUTOMATIC_TRANSCRIPT_REPLAY_PAGE_BYTES = 128 * 1024;

interface ReadLatestXtermTranscriptOptions {
  fallbackReplay?: string;
  getTranscriptPage: (request: SessionTranscriptPageRequest) => Promise<SessionTranscriptPage>;
  pageBytes?: number;
  sessionId: string;
}

function isSafeByteOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function getBoundedFallbackReplay(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return takeTerminalReplayByteTail(value, XTERM_AUTOMATIC_TRANSCRIPT_REPLAY_PAGE_BYTES);
}

export async function readLatestXtermTranscript({
  fallbackReplay,
  getTranscriptPage,
  pageBytes = XTERM_AUTOMATIC_TRANSCRIPT_REPLAY_PAGE_BYTES,
  sessionId,
}: ReadLatestXtermTranscriptOptions): Promise<string | undefined> {
  if (!isSafeByteOffset(pageBytes) || pageBytes === 0) {
    return getBoundedFallbackReplay(fallbackReplay);
  }

  try {
    const page = await getTranscriptPage({
      sessionId,
      maxBytes: pageBytes,
      terminalReplay: true,
    });
    if (
      page.health !== 'complete' ||
      !isSafeByteOffset(page.totalBytes) ||
      page.initialParserState === undefined
    ) {
      return getBoundedFallbackReplay(fallbackReplay);
    }

    return takeTerminalReplayByteTail(page.text, pageBytes, page.initialParserState);
  } catch {
    return getBoundedFallbackReplay(fallbackReplay);
  }
}
