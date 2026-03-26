import type * as React from 'react';
import { useI18n } from '@/i18n';
import type { ResolvedThemeMode } from '@/lib/appTheme';
import type { ColorPreset, CustomThemeDocument, Theme } from '@/stores/settings';

interface AppearanceSelectionBadgeProps {
  tone: 'current' | 'preview' | 'muted';
  children: React.ReactNode;
}

interface ColorPresetPreviewProps {
  presetId: ColorPreset;
  mode: ResolvedThemeMode;
  accentColor: string;
  customTheme?: CustomThemeDocument | null;
}

interface EditorSamplePreviewProps {
  theme: Theme;
  terminalTheme: string;
  colorPreset: ColorPreset;
  accentColor: string;
  customTheme?: CustomThemeDocument | null;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
}

interface AppearancePreviewPanelProps {
  title: string;
  description: string;
  modeLabel: string;
  isCustom: boolean;
  themeColor: string;
  accentColor: string;
  supportColor: string;
  previewPresetId: ColorPreset;
  previewMode: ResolvedThemeMode;
  previewCustomTheme?: CustomThemeDocument | null;
  theme: Theme;
  terminalTheme: string;
  editorFontSize: number;
  editorFontFamily: string;
  editorLineHeight: number;
  SelectionBadge: React.ComponentType<AppearanceSelectionBadgeProps>;
  PresetPreview: React.ComponentType<ColorPresetPreviewProps>;
  EditorPreview: React.ComponentType<EditorSamplePreviewProps>;
}

export function AppearancePreviewPanel({
  title,
  description,
  modeLabel,
  isCustom,
  themeColor,
  accentColor,
  supportColor,
  previewPresetId,
  previewMode,
  previewCustomTheme,
  theme,
  terminalTheme,
  editorFontSize,
  editorFontFamily,
  editorLineHeight,
  SelectionBadge,
  PresetPreview,
  EditorPreview,
}: AppearancePreviewPanelProps) {
  const { t } = useI18n();

  return (
    <div className="control-panel rounded-xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-medium">{title}</p>
            <SelectionBadge tone="current">{t('Current')}</SelectionBadge>
            <SelectionBadge tone="muted">{modeLabel}</SelectionBadge>
            {isCustom ? <SelectionBadge tone="muted">{t('Custom')}</SelectionBadge> : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:min-w-[15rem]">
          {[
            { label: t('Theme'), color: themeColor },
            { label: t('Accent'), color: accentColor },
            { label: t('Support'), color: supportColor },
          ].map((entry) => (
            <div
              key={`${entry.label}-${entry.color}`}
              className="rounded-lg border border-border/70 bg-background/55 px-2.5 py-2"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full border"
                  style={{
                    backgroundColor: entry.color,
                    borderColor: 'color-mix(in oklab, var(--foreground) 10%, transparent)',
                  }}
                />
                <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {entry.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <PresetPreview
          presetId={previewPresetId}
          mode={previewMode}
          accentColor={accentColor}
          customTheme={previewCustomTheme}
        />
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('Editor preview')}</p>
          <EditorPreview
            theme={theme}
            terminalTheme={terminalTheme}
            colorPreset={previewPresetId}
            accentColor={accentColor}
            customTheme={previewCustomTheme}
            fontSize={editorFontSize}
            fontFamily={editorFontFamily}
            lineHeight={editorLineHeight}
          />
        </div>
      </div>
    </div>
  );
}
