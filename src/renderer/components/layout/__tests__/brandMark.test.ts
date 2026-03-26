import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '../BrandMark';

const currentDir = dirname(fileURLToPath(import.meta.url));
const windowTitleBarSource = readFileSync(resolve(currentDir, '../WindowTitleBar.tsx'), 'utf8');

describe('BrandMark', () => {
  it('renders the runtime logo using theme tokens instead of a fixed image asset', () => {
    const markup = renderToStaticMarkup(React.createElement(BrandMark, { className: 'h-4 w-4' }));

    expect(markup).toContain('<svg');
    expect(markup).toContain('var(--primary)');
    expect(markup).toContain('var(--support)');
    expect(markup).not.toContain('<img');
  });

  it('keeps the title bar bound to the theme-aware brand mark component', () => {
    expect(windowTitleBarSource).toContain('BrandMark');
    expect(windowTitleBarSource).not.toContain('logo.svg');
    expect(windowTitleBarSource).not.toContain('<img');
  });
});
