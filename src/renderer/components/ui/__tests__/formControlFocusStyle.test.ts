/* @vitest-environment jsdom */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InputGroup, InputGroupInput, InputGroupTextarea } from '@/components/ui/input-group';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('form control focus styles', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('keeps grouped control focus decoration on the group wrapper', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          InputGroup,
          null,
          React.createElement(InputGroupInput, { placeholder: 'Search' }),
          React.createElement(InputGroupTextarea, { placeholder: 'Notes' })
        )
      );
    });

    const group = container.querySelector<HTMLElement>('[data-slot="input-group"]');
    const input = container.querySelector<HTMLInputElement>('[data-slot="input"]');
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-slot="textarea"]');

    input?.focus();

    expect(document.activeElement).toBe(input);
    expect(group?.className).toContain(
      'has-[input:focus-visible,textarea:focus-visible]:ring-[3px]'
    );

    for (const control of [input, textarea]) {
      expect(control?.className).toContain('focus-visible:outline-none');
      expect(control?.className).toContain('focus-visible:outline-offset-0');
      expect(control?.className).toContain('focus-visible:shadow-none');
    }
  });
});
