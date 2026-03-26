import { describe, expect, it } from 'vitest';
import { buildConsoleButtonStyle, buildConsoleTypographyModel } from '../consoleTypography';

describe('buildConsoleTypographyModel', () => {
  it('falls back to customized editor typography when app typography is still default', () => {
    const model = buildConsoleTypographyModel({
      appFontFamily: 'Inter',
      appFontSize: 14,
      editorFontFamily: 'IBM Plex Sans',
      editorFontSize: 16,
      editorLineHeight: 28,
    });

    expect(model.fontFamily).toBe('IBM Plex Sans');
    expect(model.fontSize).toBe(16);
    expect(model.bodyLineHeight).toBe(28);
    expect(model.titleLineHeight).toBe(25);
    expect(model.labelLineHeight).toBe(20);
    expect(model.buttonFontSize).toBe(16);
  });

  it('keeps explicit app typography while still inheriting editor readability rhythm', () => {
    const model = buildConsoleTypographyModel({
      appFontFamily: 'Aptos',
      appFontSize: 15,
      editorFontFamily: 'JetBrains Mono, monospace',
      editorFontSize: 13,
      editorLineHeight: 24,
    });

    expect(model.fontFamily).toBe('Aptos');
    expect(model.fontSize).toBe(15);
    expect(model.bodyLineHeight).toBe(28);
    expect(model.titleLineHeight).toBe(25);
    expect(model.labelLineHeight).toBe(20);
    expect(model.buttonFontSize).toBe(15);
  });

  it('normalizes invalid values to safe defaults', () => {
    const model = buildConsoleTypographyModel({
      appFontFamily: '   ',
      appFontSize: Number.NaN,
      editorFontFamily: '',
      editorFontSize: 0,
      editorLineHeight: -2,
    });

    expect(model.fontFamily).toBe('Inter');
    expect(model.fontSize).toBe(14);
    expect(model.bodyLineHeight).toBe(22);
    expect(model.titleLineHeight).toBe(20);
    expect(model.labelLineHeight).toBe(16);
    expect(model.buttonFontSize).toBe(14);
  });

  it('builds a shared button style from the typography model', () => {
    const model = buildConsoleTypographyModel({
      appFontFamily: 'Aptos',
      appFontSize: 15,
      editorFontFamily: 'JetBrains Mono, monospace',
      editorFontSize: 13,
      editorLineHeight: 24,
    });

    expect(buildConsoleButtonStyle(model)).toEqual({
      fontFamily: 'Aptos',
      fontSize: '15px',
      lineHeight: '28px',
    });
  });
});
