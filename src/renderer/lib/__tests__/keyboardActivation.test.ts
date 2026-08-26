import { describe, expect, it } from 'vitest';
import { handleKeyboardActivation } from '../keyboardActivation';

function createKeyboardEvent(
  key: string,
  {
    currentTarget = new EventTarget(),
    defaultPrevented = false,
    target = currentTarget,
  }: {
    currentTarget?: EventTarget;
    defaultPrevented?: boolean;
    target?: EventTarget;
  } = {}
) {
  let prevented = defaultPrevented;

  return {
    event: {
      currentTarget,
      defaultPrevented,
      key,
      preventDefault: () => {
        prevented = true;
      },
      target,
    },
    wasPrevented: () => prevented,
  };
}

describe('handleKeyboardActivation', () => {
  it.each([
    'Enter',
    ' ',
  ])('activates custom controls with %s and prevents the browser default', (key) => {
    const keyboardEvent = createKeyboardEvent(key);
    let activationCount = 0;

    const handled = handleKeyboardActivation(keyboardEvent.event, () => {
      activationCount += 1;
    });

    expect(handled).toBe(true);
    expect(activationCount).toBe(1);
    expect(keyboardEvent.wasPrevented()).toBe(true);
  });

  it('does not activate custom controls for unrelated or already handled keys', () => {
    const escapeEvent = createKeyboardEvent('Escape');
    const handledEvent = createKeyboardEvent('Enter', { defaultPrevented: true });
    let activationCount = 0;

    expect(
      handleKeyboardActivation(escapeEvent.event, () => {
        activationCount += 1;
      })
    ).toBe(false);
    expect(
      handleKeyboardActivation(handledEvent.event, () => {
        activationCount += 1;
      })
    ).toBe(false);
    expect(activationCount).toBe(0);
    expect(escapeEvent.wasPrevented()).toBe(false);
    expect(handledEvent.wasPrevented()).toBe(true);
  });

  it('does not activate a control from a nested interactive descendant', () => {
    const keyboardEvent = createKeyboardEvent(' ', {
      currentTarget: new EventTarget(),
      target: new EventTarget(),
    });
    let activationCount = 0;

    expect(
      handleKeyboardActivation(keyboardEvent.event, () => {
        activationCount += 1;
      })
    ).toBe(false);
    expect(activationCount).toBe(0);
    expect(keyboardEvent.wasPrevented()).toBe(false);
  });
});
