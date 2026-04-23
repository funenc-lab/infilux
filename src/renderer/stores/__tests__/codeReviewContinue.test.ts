import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type CodeReviewDataEvent = {
  reviewId: string;
  type: 'data' | 'error' | 'exit';
  data?: string;
  exitCode?: number;
};

type CodeReviewDataListener = (event: CodeReviewDataEvent) => void;

describe('code review continue store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('updates review state and continue-conversation flags through store actions', async () => {
    const { useCodeReviewContinueStore } = await import('../codeReviewContinue');
    const store = useCodeReviewContinueStore.getState();

    store.minimize();
    expect(useCodeReviewContinueStore.getState().isMinimized).toBe(true);

    store.restore();
    expect(useCodeReviewContinueStore.getState().isMinimized).toBe(false);

    store.updateReview({
      status: 'streaming',
      repoPath: '/repo',
    });
    store.appendContent('hello');
    store.setReviewId('review-1');
    store.setSessionId('session-1');

    expect(useCodeReviewContinueStore.getState().review).toMatchObject({
      content: 'hello',
      status: 'streaming',
      repoPath: '/repo',
      reviewId: 'review-1',
      sessionId: 'session-1',
    });

    store.requestContinue('session-1', 'claude-code');
    expect(useCodeReviewContinueStore.getState().continueConversation).toEqual({
      sessionId: 'session-1',
      provider: 'claude-code',
      shouldSwitchToChatTab: true,
    });

    store.clearContinueRequest();
    expect(useCodeReviewContinueStore.getState().continueConversation).toEqual({
      sessionId: null,
      provider: null,
      shouldSwitchToChatTab: true,
    });

    store.clearChatTabSwitch();
    expect(useCodeReviewContinueStore.getState().continueConversation).toEqual({
      sessionId: null,
      provider: null,
      shouldSwitchToChatTab: false,
    });

    store.requestChatTabSwitch();
    expect(useCodeReviewContinueStore.getState().continueConversation.shouldSwitchToChatTab).toBe(
      true
    );

    store.resetReview();
    expect(useCodeReviewContinueStore.getState().isMinimized).toBe(false);
    expect(useCodeReviewContinueStore.getState().review).toEqual({
      content: '',
      status: 'idle',
      error: null,
      repoPath: null,
      reviewId: null,
      sessionId: null,
    });
  });

  it('starts, streams, completes, and stops a code review session', async () => {
    const onCodeReviewDataCleanup = vi.fn();
    let onCodeReviewData: CodeReviewDataListener | null = null;
    const startCodeReviewMock = vi.fn(async () => ({ success: true }));
    const stopCodeReviewMock = vi.fn(async () => undefined);

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          onCodeReviewData: vi.fn((callback) => {
            onCodeReviewData = callback;
            return onCodeReviewDataCleanup;
          }),
          startCodeReview: startCodeReviewMock,
          stopCodeReview: stopCodeReviewMock,
        },
      },
    });
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'uuid-session-1'),
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const { startCodeReview, stopCodeReview, useCodeReviewContinueStore } = await import(
      '../codeReviewContinue'
    );

    await startCodeReview('/repo', {
      provider: 'claude-code',
      model: 'claude-4-sonnet',
      reasoningEffort: 'high',
      language: 'English',
      prompt: 'Review changes',
    });

    const reviewId = useCodeReviewContinueStore.getState().review.reviewId;
    expect(reviewId).toMatch(/^review-1710000000000-/);
    expect(useCodeReviewContinueStore.getState().review.sessionId).toBe('uuid-session-1');
    expect(startCodeReviewMock).toHaveBeenCalledWith('/repo', {
      provider: 'claude-code',
      model: 'claude-4-sonnet',
      reasoningEffort: 'high',
      language: 'English',
      reviewId,
      sessionId: 'uuid-session-1',
      prompt: 'Review changes',
    });
    if (onCodeReviewData == null) {
      throw new Error('Expected code review data listener to be registered');
    }
    const emitReviewEvent: CodeReviewDataListener = onCodeReviewData;

    emitReviewEvent({
      reviewId: reviewId ?? '',
      type: 'data',
      data: 'chunk-1',
    });
    expect(useCodeReviewContinueStore.getState().review).toMatchObject({
      status: 'streaming',
      content: 'chunk-1',
    });

    emitReviewEvent({
      reviewId: reviewId ?? '',
      type: 'exit',
      exitCode: 0,
    });
    expect(useCodeReviewContinueStore.getState().review.status).toBe('complete');

    stopCodeReview();

    expect(onCodeReviewDataCleanup).toHaveBeenCalledTimes(1);
    expect(stopCodeReviewMock).toHaveBeenCalledWith(reviewId);
    expect(useCodeReviewContinueStore.getState().review.reviewId).toBeNull();
    expect(useCodeReviewContinueStore.getState().review.status).toBe('idle');
  });

  it('ignores unrelated review events and preserves explicit error state on non-zero exit', async () => {
    const onCodeReviewDataCleanup = vi.fn();
    let onCodeReviewData: CodeReviewDataListener | null = null;

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          onCodeReviewData: vi.fn((callback) => {
            onCodeReviewData = callback;
            return onCodeReviewDataCleanup;
          }),
          startCodeReview: vi.fn(async () => ({ success: true })),
          stopCodeReview: vi.fn(async () => undefined),
        },
      },
    });
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'uuid-session-3'),
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_200);
    vi.spyOn(Math, 'random').mockReturnValue(0.2468);

    const { startCodeReview, stopCodeReview, useCodeReviewContinueStore } = await import(
      '../codeReviewContinue'
    );

    await startCodeReview('/repo', {
      provider: 'claude-code',
      model: 'claude-4-sonnet',
      language: 'English',
    });

    const reviewId = useCodeReviewContinueStore.getState().review.reviewId;
    expect(reviewId).toBeTruthy();
    if (onCodeReviewData == null) {
      throw new Error('Expected code review data listener to be registered');
    }
    const emitReviewEvent: CodeReviewDataListener = onCodeReviewData;

    emitReviewEvent({
      reviewId: 'other-review',
      type: 'data',
      data: 'ignored-data',
    });
    expect(useCodeReviewContinueStore.getState().review.content).toBe('');

    useCodeReviewContinueStore.getState().setReviewId('stale-review');
    emitReviewEvent({
      reviewId: reviewId ?? '',
      type: 'data',
      data: 'stale-data',
    });
    expect(useCodeReviewContinueStore.getState().review.content).toBe('');

    useCodeReviewContinueStore.getState().setReviewId(reviewId);
    emitReviewEvent({
      reviewId: reviewId ?? '',
      type: 'error',
      data: 'review failed',
    });
    expect(useCodeReviewContinueStore.getState().review).toMatchObject({
      status: 'error',
      error: 'review failed',
    });

    emitReviewEvent({
      reviewId: reviewId ?? '',
      type: 'exit',
      exitCode: 1,
    });
    expect(useCodeReviewContinueStore.getState().review).toMatchObject({
      status: 'error',
      error: 'Process exited with code 1',
    });

    useCodeReviewContinueStore.getState().updateReview({
      status: 'error',
      error: 'review failed again',
    });
    emitReviewEvent({
      reviewId: reviewId ?? '',
      type: 'exit',
      exitCode: 0,
    });
    expect(useCodeReviewContinueStore.getState().review).toMatchObject({
      status: 'error',
      error: 'review failed again',
    });

    stopCodeReview();

    expect(onCodeReviewDataCleanup).toHaveBeenCalledTimes(1);
  });

  it('records errors when starting a code review fails before the process begins streaming', async () => {
    const stopCodeReviewMock = vi.fn(async () => undefined);

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          onCodeReviewData: vi.fn(() => vi.fn()),
          startCodeReview: vi.fn(async () => ({ success: false, error: 'Failed to start review' })),
          stopCodeReview: stopCodeReviewMock,
        },
      },
    });
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'uuid-session-2'),
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_100);
    vi.spyOn(Math, 'random').mockReturnValue(0.987654321);

    const { startCodeReview, useCodeReviewContinueStore } = await import('../codeReviewContinue');

    await startCodeReview('/repo', {
      provider: 'claude-code',
      model: 'claude-4-sonnet',
      language: 'English',
    });

    expect(useCodeReviewContinueStore.getState().review).toMatchObject({
      status: 'idle',
      error: 'Failed to start review',
      repoPath: '/repo',
      sessionId: 'uuid-session-2',
    });
    expect(useCodeReviewContinueStore.getState().review.reviewId).toBeNull();
    expect(stopCodeReviewMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic error message when review startup throws a non-Error value', async () => {
    const stopCodeReviewMock = vi.fn(async () => undefined);

    vi.stubGlobal('window', {
      electronAPI: {
        git: {
          onCodeReviewData: vi.fn(() => vi.fn()),
          startCodeReview: vi.fn(async () => {
            throw 'boom';
          }),
          stopCodeReview: stopCodeReviewMock,
        },
      },
    });
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => 'uuid-session-4'),
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_710_000_000_300);
    vi.spyOn(Math, 'random').mockReturnValue(0.1357);

    const { startCodeReview, stopCodeReview, useCodeReviewContinueStore } = await import(
      '../codeReviewContinue'
    );

    await startCodeReview('/repo', {
      provider: 'claude-code',
      model: 'claude-4-sonnet',
      language: 'English',
    });

    expect(useCodeReviewContinueStore.getState().review).toMatchObject({
      status: 'idle',
      error: 'Failed to start review',
      repoPath: '/repo',
      sessionId: 'uuid-session-4',
    });
    expect(useCodeReviewContinueStore.getState().review.reviewId).toBeNull();
    expect(stopCodeReviewMock).toHaveBeenCalledTimes(1);

    stopCodeReview();

    expect(stopCodeReviewMock).toHaveBeenCalledTimes(1);
  });
});
