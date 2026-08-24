import type { SessionTranscriptPage, SessionTranscriptPageRequest } from '@shared/types';
import { takeTerminalReplayByteTail } from '@shared/utils/terminalReplayTail';

export const XTERM_AUTOMATIC_TRANSCRIPT_REPLAY_PAGE_BYTES = 128 * 1024;
export const XTERM_AUTOMATIC_TRANSCRIPT_REPLAY_TIMEOUT_MS = 3_000;

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

function getTranscriptPageWithinTimeout(
  getTranscriptPage: ReadLatestXtermTranscriptOptions['getTranscriptPage'],
  request: SessionTranscriptPageRequest
): Promise<SessionTranscriptPage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out while reading the terminal replay transcript'));
    }, XTERM_AUTOMATIC_TRANSCRIPT_REPLAY_TIMEOUT_MS);

    void getTranscriptPage(request).then(
      (page) => {
        clearTimeout(timeout);
        resolve(page);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
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
    const page = await getTranscriptPageWithinTimeout(getTranscriptPage, {
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

    // A persistent archive is opened before the initial tmux replay is copied into it.
    // Do not let that transient, but healthy, empty page erase the attached session output.
    if (page.text.length === 0 && fallbackReplay) {
      return getBoundedFallbackReplay(fallbackReplay);
    }

    return takeTerminalReplayByteTail(page.text, pageBytes, page.initialParserState);
  } catch {
    return getBoundedFallbackReplay(fallbackReplay);
  }
}
