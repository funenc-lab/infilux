/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { hideXtermReplaySurface } from '../xtermReplaySurface';

describe('hideXtermReplaySurface', () => {
  it('keeps a measured surface hidden until replay restoration completes', () => {
    const surface = document.createElement('div');
    surface.style.visibility = 'visible';

    const restore = hideXtermReplaySurface(surface);

    expect(surface.style.visibility).toBe('hidden');

    restore();

    expect(surface.style.visibility).toBe('visible');
  });

  it('does not overwrite a newer visibility decision', () => {
    const surface = document.createElement('div');
    const restore = hideXtermReplaySurface(surface);
    surface.style.visibility = 'visible';

    restore();

    expect(surface.style.visibility).toBe('visible');
  });
});
