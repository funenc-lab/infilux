import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  getFileIcon,
  getFileIconColor,
  isImageFile,
  isPdfFile,
  isUnsupportedBinaryFile,
} from '../fileIcons';

function renderIconName(name: string, isDirectory: boolean, isExpanded = false): string {
  const Icon = getFileIcon(name, isDirectory, isExpanded);
  return renderToStaticMarkup(React.createElement(Icon)).toLowerCase();
}

describe('fileIcons', () => {
  it('returns folder icons for collapsed and expanded directories', () => {
    expect(renderIconName('src', true, false)).toContain('folder');
    expect(renderIconName('src', true, true)).toContain('folder-open');
  });

  it('prefers special-file icons over plain extensions', () => {
    expect(renderIconName('package.json', false)).toContain('file-braces');
    expect(renderIconName('tsconfig.json', false)).toContain('settings');
    expect(renderIconName('README.md', false)).toContain('file-text');
  });

  it('maps common editor file types to stable icon families and semantic colors', () => {
    expect(renderIconName('component.tsx', false)).toContain('file-code');
    expect(renderIconName('styles.css', false)).toContain('braces');
    expect(renderIconName('query.sql', false)).toContain('database');
    expect(getFileIconColor('component.tsx', false)).toBe('text-info');
    expect(getFileIconColor('query.sql', false)).toBe('text-muted-foreground');
    expect(getFileIconColor('image.png', false)).toBe('text-success');
    expect(getFileIconColor('docs.pdf', false)).toBe('text-destructive');
  });

  it('detects image and pdf preview candidates from the path alone', () => {
    expect(isImageFile('/repo/assets/logo.SVG')).toBe(true);
    expect(isImageFile('/repo/assets/logo.txt')).toBe(false);
    expect(isPdfFile('/repo/docs/spec.PDF')).toBe(true);
    expect(isPdfFile('/repo/docs/spec.md')).toBe(false);
  });

  it('marks binary files unsupported only when they have no dedicated preview path', () => {
    expect(isUnsupportedBinaryFile('/repo/assets/logo.png', true)).toBe(false);
    expect(isUnsupportedBinaryFile('/repo/docs/spec.pdf', true)).toBe(false);
    expect(isUnsupportedBinaryFile('/repo/bin/archive.bin', true)).toBe(true);
    expect(isUnsupportedBinaryFile('/repo/src/index.ts', false)).toBe(false);
  });
});
