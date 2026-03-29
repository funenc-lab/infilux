import type { CSSProperties } from 'react';
import { defaultEditorSettings } from '@/stores/settings/defaults';

const DEFAULT_APP_FONT_FAMILY = 'Inter';
const DEFAULT_APP_FONT_SIZE = 14;
const MIN_READABILITY_RATIO = 1.35;
const MAX_READABILITY_RATIO = 2.2;

export interface ConsoleTypographySettings {
  appFontFamily?: string;
  appFontSize?: number;
  editorFontFamily?: string;
  editorFontSize?: number;
  editorLineHeight?: number;
}

export interface ConsoleTypographyModel {
  fontFamily: string;
  fontSize: number;
  eyebrowFontSize: number;
  embeddedBodyFontSize: number;
  panelBodyFontSize: number;
  detailValueFontSize: number;
  embeddedTitleFontSize: number;
  panelTitleFontSize: number;
  bodyLineHeight: number;
  titleLineHeight: number;
  labelLineHeight: number;
  buttonFontSize: number;
}

function normalizeFontFamily(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.round(value);
}

export function buildConsoleTypographyModel({
  appFontFamily,
  appFontSize,
  editorFontFamily,
  editorFontSize,
  editorLineHeight,
}: ConsoleTypographySettings): ConsoleTypographyModel {
  const resolvedAppFontFamily = normalizeFontFamily(appFontFamily, DEFAULT_APP_FONT_FAMILY);
  const resolvedEditorFontFamily = normalizeFontFamily(
    editorFontFamily,
    defaultEditorSettings.fontFamily
  );
  const resolvedAppFontSize = normalizePositiveNumber(appFontSize, DEFAULT_APP_FONT_SIZE);
  const resolvedEditorFontSize = normalizePositiveNumber(
    editorFontSize,
    defaultEditorSettings.fontSize
  );
  const resolvedEditorLineHeight = normalizePositiveNumber(
    editorLineHeight,
    defaultEditorSettings.lineHeight
  );

  const shouldUseEditorFontFamily =
    resolvedAppFontFamily === DEFAULT_APP_FONT_FAMILY &&
    resolvedEditorFontFamily !== defaultEditorSettings.fontFamily;
  const shouldUseEditorFontSize =
    resolvedAppFontSize === DEFAULT_APP_FONT_SIZE &&
    resolvedEditorFontSize !== defaultEditorSettings.fontSize;

  const fontFamily = shouldUseEditorFontFamily ? resolvedEditorFontFamily : resolvedAppFontFamily;
  const fontSize = shouldUseEditorFontSize ? resolvedEditorFontSize : resolvedAppFontSize;
  const readabilityRatio = resolvedEditorLineHeight / resolvedEditorFontSize;
  const clampedRatio = Math.min(
    MAX_READABILITY_RATIO,
    Math.max(MIN_READABILITY_RATIO, readabilityRatio)
  );
  const bodyLineHeight = Math.max(fontSize + 4, Math.round(fontSize * clampedRatio));
  const titleLineHeight = Math.max(fontSize + 6, Math.round(bodyLineHeight * 0.9));
  const labelLineHeight = Math.max(12, Math.round(bodyLineHeight * 0.72));
  const buttonFontSize = Math.max(14, fontSize);
  const eyebrowFontSize = Math.max(11, Math.round(fontSize * 0.79));
  const embeddedBodyFontSize = fontSize;
  const panelBodyFontSize = Math.max(fontSize, Math.round(fontSize * 1.07));
  const detailValueFontSize = panelBodyFontSize;
  const embeddedTitleFontSize = Math.max(fontSize + 3, Math.round(fontSize * 1.18));
  const panelTitleFontSize = Math.max(fontSize + 5, Math.round(fontSize * 1.4));

  return {
    fontFamily,
    fontSize,
    eyebrowFontSize,
    embeddedBodyFontSize,
    panelBodyFontSize,
    detailValueFontSize,
    embeddedTitleFontSize,
    panelTitleFontSize,
    bodyLineHeight,
    titleLineHeight,
    labelLineHeight,
    buttonFontSize,
  };
}

export function buildConsoleButtonStyle(typography: ConsoleTypographyModel): CSSProperties {
  return {
    fontFamily: typography.fontFamily,
    fontSize: `${typography.buttonFontSize}px`,
    lineHeight: `${typography.bodyLineHeight}px`,
  };
}
