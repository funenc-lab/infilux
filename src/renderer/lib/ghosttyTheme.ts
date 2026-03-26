// Ghostty theme utilities - uses pre-generated themes JSON

import terminalThemes from '@/data/terminal-themes.json';

export interface GhosttyTheme {
  name: string;
  palette: string[]; // 16 colors (0-15)
  background: string;
  foreground: string;
  cursorColor: string;
  cursorText: string;
  selectionBackground: string;
  selectionForeground: string;
}

export interface XtermTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  selectionForeground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

// Type for the imported themes
const themes = terminalThemes as Record<string, GhosttyTheme>;

// Get all theme names sorted alphabetically
export function getThemeNames(): string[] {
  return Object.keys(themes).sort((a, b) => a.localeCompare(b));
}

// Get a specific theme by name
export function getTheme(name: string): GhosttyTheme | undefined {
  return themes[name];
}

// Convert GhosttyTheme to xterm.js ITheme format
export function ghosttyToXterm(theme: GhosttyTheme): XtermTheme {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursorColor,
    cursorAccent: theme.cursorText,
    selectionBackground: theme.selectionBackground,
    selectionForeground: theme.selectionForeground,
    black: theme.palette[0],
    red: theme.palette[1],
    green: theme.palette[2],
    yellow: theme.palette[3],
    blue: theme.palette[4],
    magenta: theme.palette[5],
    cyan: theme.palette[6],
    white: theme.palette[7],
    brightBlack: theme.palette[8],
    brightRed: theme.palette[9],
    brightGreen: theme.palette[10],
    brightYellow: theme.palette[11],
    brightBlue: theme.palette[12],
    brightMagenta: theme.palette[13],
    brightCyan: theme.palette[14],
    brightWhite: theme.palette[15],
  };
}

// Get xterm theme by name
export function getXtermTheme(name: string): XtermTheme | undefined {
  const theme = getTheme(name);
  return theme ? ghosttyToXterm(theme) : undefined;
}

// Default dark theme for fallback
export const defaultDarkTheme: XtermTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

// Default light theme for fallback
export const defaultLightTheme: XtermTheme = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#333333',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
};

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseColorWithAlpha(color: string): RGBA | null {
  const c = color.trim();

  if (c === 'transparent') return null;

  const hex6 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
  if (hex6) {
    return {
      r: Number.parseInt(hex6[1], 16),
      g: Number.parseInt(hex6[2], 16),
      b: Number.parseInt(hex6[3], 16),
      a: 1,
    };
  }

  const hex3 = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(c);
  if (hex3) {
    return {
      r: Number.parseInt(hex3[1] + hex3[1], 16),
      g: Number.parseInt(hex3[2] + hex3[2], 16),
      b: Number.parseInt(hex3[3] + hex3[3], 16),
      a: 1,
    };
  }

  const hex8 = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(c);
  if (hex8) {
    return {
      r: Number.parseInt(hex8[1], 16),
      g: Number.parseInt(hex8[2], 16),
      b: Number.parseInt(hex8[3], 16),
      a: Number.parseInt(hex8[4], 16) / 255,
    };
  }

  const rgbaMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/.exec(c);
  if (rgbaMatch) {
    return {
      r: Number.parseInt(rgbaMatch[1], 10),
      g: Number.parseInt(rgbaMatch[2], 10),
      b: Number.parseInt(rgbaMatch[3], 10),
      a: rgbaMatch[4] ? Number.parseFloat(rgbaMatch[4]) : 1,
    };
  }

  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const rgba = parseColorWithAlpha(hex);
  return rgba ? { r: rgba.r, g: rgba.g, b: rgba.b } : null;
}

function formatRgba({ r, g, b, a }: RGBA): string {
  const rounded = {
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(b),
    a: clamp(a, 0, 1),
  };

  if (rounded.a >= 0.999) {
    return `rgb(${rounded.r}, ${rounded.g}, ${rounded.b})`;
  }

  return `rgba(${rounded.r}, ${rounded.g}, ${rounded.b}, ${rounded.a.toFixed(3)})`;
}

export function hexToRgba(color: string, opacity: number): string {
  const rgba = parseColorWithAlpha(color);
  if (!rgba) return color;
  const newAlpha = Math.max(0, Math.min(1, opacity / 100));
  const finalAlpha = rgba.a * newAlpha;
  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${finalAlpha})`;
}

function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(getLuminance(foreground), getLuminance(background));
  const darker = Math.min(getLuminance(foreground), getLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function mixColors(left: string, right: string, ratio: number): string {
  const leftColor = parseColorWithAlpha(left);
  const rightColor = parseColorWithAlpha(right);
  if (!leftColor || !rightColor) {
    return left;
  }

  const normalizedRatio = clamp(ratio, 0, 1);
  const inverseRatio = 1 - normalizedRatio;

  return formatRgba({
    r: leftColor.r * inverseRatio + rightColor.r * normalizedRatio,
    g: leftColor.g * inverseRatio + rightColor.g * normalizedRatio,
    b: leftColor.b * inverseRatio + rightColor.b * normalizedRatio,
    a: leftColor.a * inverseRatio + rightColor.a * normalizedRatio,
  });
}

function ensureReadableForeground(
  foreground: string,
  background: string,
  fallback: string,
  minimumContrast = 4.5
): string {
  if (getContrastRatio(foreground, background) >= minimumContrast) {
    return foreground;
  }

  return getContrastRatio(fallback, background) >= minimumContrast ? fallback : foreground;
}

function getReadableOnColor(background: string, darkOption = '#0f172a', lightOption = '#ffffff') {
  return getContrastRatio(darkOption, background) > getContrastRatio(lightOption, background)
    ? darkOption
    : lightOption;
}

function getColorVibrancy(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return 0;
  }

  const channels = [rgb.r, rgb.g, rgb.b];
  return (Math.max(...channels) - Math.min(...channels)) / 255;
}

function getAccentRichness(color: string): number {
  const rgb = hexToRgb(color);
  if (!rgb) {
    return 0;
  }

  const channels = [rgb.r, rgb.g, rgb.b].sort((left, right) => right - left);
  return (channels[1] - channels[2]) / 255;
}

function isReadableAccentCandidate(candidate: string, background: string): boolean {
  return getContrastRatio(candidate, background) >= 3;
}

function scoreAccentCandidate(candidate: string, background: string): number {
  const contrast = getContrastRatio(candidate, background);
  return (
    Math.min(contrast, 5.5) * 1.6 +
    getColorVibrancy(candidate) * 2.4 +
    getAccentRichness(candidate) * 2.8
  );
}

function pickBestAccentCandidate(candidates: string[], background: string): string {
  let best = candidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const score = scoreAccentCandidate(candidate, background);

    if (score > bestScore + 0.05) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function pickPrimaryAccent(theme: XtermTheme, background: string, isDark: boolean): string {
  if (!hexToRgb(background)) {
    return theme.foreground;
  }

  const accentCandidateGroups = isDark
    ? [
        [
          theme.brightMagenta,
          theme.brightYellow,
          theme.brightGreen,
          theme.brightCyan,
          theme.brightBlue,
        ],
        [theme.magenta, theme.yellow, theme.green, theme.cyan, theme.blue],
      ]
    : [
        [theme.magenta, theme.blue, theme.cyan, theme.green, theme.yellow],
        [
          theme.brightMagenta,
          theme.brightBlue,
          theme.brightCyan,
          theme.brightGreen,
          theme.brightYellow,
        ],
      ];

  for (const group of accentCandidateGroups) {
    const readableCandidates = group.filter((candidate) =>
      isReadableAccentCandidate(candidate, background)
    );

    if (readableCandidates.length > 0) {
      return pickBestAccentCandidate(readableCandidates, background);
    }
  }

  return pickBestAccentCandidate([...accentCandidateGroups.flat(), theme.foreground], background);
}

function createTerminalThemeVariables(theme: XtermTheme, isDark: boolean): Record<string, string> {
  const fallbackTheme = isDark ? defaultDarkTheme : defaultLightTheme;
  const background = theme.background;
  const foreground = ensureReadableForeground(
    theme.foreground,
    background,
    fallbackTheme.foreground,
    4.5
  );
  const primary = pickPrimaryAccent(theme, background, isDark);
  const primaryForeground = getReadableOnColor(primary);
  const card = mixColors(background, foreground, isDark ? 0.04 : 0.025);
  const popover = mixColors(background, foreground, isDark ? 0.045 : 0.03);
  const secondary = mixColors(background, foreground, isDark ? 0.085 : 0.065);
  const muted = mixColors(background, foreground, isDark ? 0.07 : 0.055);
  const mutedForeground = ensureReadableForeground(
    mixColors(foreground, background, isDark ? 0.3 : 0.38),
    muted,
    mixColors(fallbackTheme.foreground, background, isDark ? 0.24 : 0.32),
    3.4
  );
  const accent = mixColors(background, primary, isDark ? 0.2 : 0.14);
  const accentForeground = getReadableOnColor(accent);
  const border = mixColors(background, foreground, isDark ? 0.16 : 0.12);
  const input = mixColors(background, foreground, isDark ? 0.17 : 0.13);
  const ring = primary;

  return {
    '--background': background,
    '--foreground': foreground,
    '--card': card,
    '--card-foreground': foreground,
    '--popover': popover,
    '--popover-foreground': foreground,
    '--secondary': secondary,
    '--secondary-foreground': foreground,
    '--muted': muted,
    '--muted-foreground': mutedForeground,
    '--accent': accent,
    '--accent-foreground': accentForeground,
    '--primary': primary,
    '--primary-foreground': primaryForeground,
    '--border': border,
    '--input': input,
    '--ring': ring,
  };
}

export function isTerminalThemeDark(themeName: string): boolean {
  const theme = getXtermTheme(themeName);
  if (!theme) return true;
  return getLuminance(theme.background) < 0.5;
}

export function getTerminalThemeAccent(themeName: string): string {
  const theme = getXtermTheme(themeName);
  if (!theme) {
    return '';
  }

  const isDark = getLuminance(theme.background) < 0.5;
  return pickPrimaryAccent(theme, theme.background, isDark);
}

// Apply terminal theme colors to app CSS variables
// syncDarkMode: if true, toggle dark class based on terminal theme; if false, don't change it
export function applyTerminalThemeToApp(themeName: string, syncDarkMode = true): void {
  const theme = getXtermTheme(themeName);
  if (!theme) return;

  const root = document.documentElement;
  const isDark = getLuminance(theme.background) < 0.5;

  // Only toggle dark class if syncDarkMode is true
  if (syncDarkMode) {
    root.classList.toggle('dark', isDark);
  }

  const variables = createTerminalThemeVariables(theme, isDark);

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}

// Clear terminal theme colors from app (restore CSS defaults)
export function clearTerminalThemeFromApp(): void {
  const root = document.documentElement;
  const cssVars = [
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--popover',
    '--popover-foreground',
    '--secondary',
    '--secondary-foreground',
    '--muted',
    '--muted-foreground',
    '--accent',
    '--accent-foreground',
    '--primary',
    '--primary-foreground',
    '--border',
    '--input',
    '--ring',
  ];

  for (const v of cssVars) {
    root.style.removeProperty(v);
  }
}
