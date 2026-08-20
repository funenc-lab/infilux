import { describe, expect, it } from 'vitest';
import { XTERM_HIBERNATION_IDLE_MS, XtermHibernateController } from '../xtermHibernateController';

describe('XtermHibernateController', () => {
  it('hibernates only after a hidden inactive terminal reaches the idle threshold', () => {
    const controller = new XtermHibernateController();
    const input = {
      hasSelection: false,
      isActive: false,
      isReadOnlyTranscript: false,
      isVisible: false,
    };

    expect(controller.evaluate(input, 100)).toEqual({
      kind: 'wait',
      delayMs: XTERM_HIBERNATION_IDLE_MS,
    });
    expect(controller.evaluate(input, 100 + XTERM_HIBERNATION_IDLE_MS - 1)).toEqual({
      kind: 'wait',
      delayMs: 1,
    });
    expect(controller.evaluate(input, 100 + XTERM_HIBERNATION_IDLE_MS)).toEqual({
      kind: 'hibernate',
    });
  });

  it.each([
    { hasSelection: false, isActive: true, isReadOnlyTranscript: false, isVisible: false },
    { hasSelection: false, isActive: false, isReadOnlyTranscript: false, isVisible: true },
    { hasSelection: true, isActive: false, isReadOnlyTranscript: false, isVisible: false },
    { hasSelection: false, isActive: false, isReadOnlyTranscript: true, isVisible: false },
  ])('keeps ineligible terminals live', (input) => {
    const controller = new XtermHibernateController();

    expect(controller.evaluate(input, 100)).toEqual({ kind: 'ineligible' });
    expect(controller.evaluate(input, 100 + XTERM_HIBERNATION_IDLE_MS)).toEqual({
      kind: 'ineligible',
    });
  });

  it('restarts the idle period when the terminal becomes eligible again', () => {
    const controller = new XtermHibernateController();
    const hidden = {
      hasSelection: false,
      isActive: false,
      isReadOnlyTranscript: false,
      isVisible: false,
    };

    controller.evaluate(hidden, 100);
    controller.evaluate({ ...hidden, isVisible: true }, 200);

    expect(controller.evaluate(hidden, 300)).toEqual({
      kind: 'wait',
      delayMs: XTERM_HIBERNATION_IDLE_MS,
    });
  });
});
