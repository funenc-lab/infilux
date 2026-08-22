import type { SessionTranscriptPage, SessionTranscriptPageRequest } from '@shared/types';

export const XTERM_TRANSCRIPT_REPLAY_PAGE_BYTES = 256 * 1024;

interface ReadCompleteXtermTranscriptOptions {
  getTranscriptPage: (request: SessionTranscriptPageRequest) => Promise<SessionTranscriptPage>;
  pageBytes?: number;
  sessionId: string;
}

function isSafeByteOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isCompleteTranscriptPage(
  page: SessionTranscriptPage,
  expectedEndByteOffset: number,
  expectedTotalBytes: number
): boolean {
  if (
    page.health !== 'complete' ||
    !isSafeByteOffset(page.totalBytes) ||
    page.totalBytes < expectedTotalBytes
  ) {
    return false;
  }

  const pageByteLength = new TextEncoder().encode(page.text).byteLength;
  if (page.nextBeforeByteOffset === undefined) {
    return pageByteLength === expectedEndByteOffset;
  }

  return (
    isSafeByteOffset(page.nextBeforeByteOffset) &&
    page.nextBeforeByteOffset < expectedEndByteOffset &&
    page.nextBeforeByteOffset + pageByteLength === expectedEndByteOffset
  );
}

function areTranscriptPagesEqual(
  first: SessionTranscriptPage,
  second: SessionTranscriptPage
): boolean {
  return (
    first.health === second.health &&
    first.nextBeforeByteOffset === second.nextBeforeByteOffset &&
    first.text === second.text &&
    first.totalBytes === second.totalBytes
  );
}

export async function readCompleteXtermTranscript({
  getTranscriptPage,
  pageBytes = XTERM_TRANSCRIPT_REPLAY_PAGE_BYTES,
  sessionId,
}: ReadCompleteXtermTranscriptOptions): Promise<string | undefined> {
  if (!isSafeByteOffset(pageBytes) || pageBytes === 0) {
    return undefined;
  }

  const pages: string[] = [];
  let beforeByteOffset: number | undefined;
  let expectedEndByteOffset: number | undefined;
  let expectedTotalBytes: number | undefined;
  let initialPage: SessionTranscriptPage | undefined;

  try {
    while (true) {
      const page = await getTranscriptPage({
        sessionId,
        ...(beforeByteOffset === undefined ? {} : { beforeByteOffset }),
        maxBytes: pageBytes,
      });
      if (!isSafeByteOffset(page.totalBytes)) {
        return undefined;
      }

      const pageEndByteOffset = expectedEndByteOffset ?? page.totalBytes;
      const totalBytes = expectedTotalBytes ?? page.totalBytes;
      if (!isCompleteTranscriptPage(page, pageEndByteOffset, totalBytes)) {
        return undefined;
      }
      initialPage ??= page;

      pages.unshift(page.text);
      if (page.nextBeforeByteOffset === undefined) {
        const verificationPage = await getTranscriptPage({
          sessionId,
          maxBytes: pageBytes,
        });
        return initialPage && areTranscriptPagesEqual(initialPage, verificationPage)
          ? pages.join('')
          : undefined;
      }

      beforeByteOffset = page.nextBeforeByteOffset;
      expectedEndByteOffset = page.nextBeforeByteOffset;
      expectedTotalBytes = totalBytes;
    }
  } catch {
    return undefined;
  }
}
