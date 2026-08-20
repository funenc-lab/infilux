export const XTERM_HIBERNATION_IDLE_MS = 60 * 1000;

export interface XtermHibernateInput {
  hasSelection: boolean;
  isActive: boolean;
  isReadOnlyTranscript: boolean;
  isVisible: boolean;
}

export type XtermHibernateDecision =
  | { kind: 'hibernate' }
  | { kind: 'ineligible' }
  | { delayMs: number; kind: 'wait' };

export class XtermHibernateController {
  private eligibleSince: number | null = null;

  evaluate(input: XtermHibernateInput, now = Date.now()): XtermHibernateDecision {
    if (input.isActive || input.isVisible || input.hasSelection || input.isReadOnlyTranscript) {
      this.eligibleSince = null;
      return { kind: 'ineligible' };
    }

    if (this.eligibleSince === null) {
      this.eligibleSince = now;
      return { kind: 'wait', delayMs: XTERM_HIBERNATION_IDLE_MS };
    }

    const remainingDelay = XTERM_HIBERNATION_IDLE_MS - (now - this.eligibleSince);
    if (remainingDelay <= 0) {
      return { kind: 'hibernate' };
    }

    return { kind: 'wait', delayMs: remainingDelay };
  }

  reset(): void {
    this.eligibleSince = null;
  }
}
