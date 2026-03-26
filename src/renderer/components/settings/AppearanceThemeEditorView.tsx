import { ChevronLeft } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import {
  APP_THEME_PROTECTED_TOKEN_KEYS,
  APP_THEME_TOKEN_GROUPS,
  getColorPresetOption,
  type ResolvedThemeMode,
} from '@/lib/appTheme';
import type { ColorPreset, CustomThemeDocument, Theme } from '@/stores/settings';

const protectedThemeTokenKeys = new Set<string>(APP_THEME_PROTECTED_TOKEN_KEYS);

interface AppearanceSelectionBadgeProps {
  tone: 'current' | 'preview' | 'muted';
  children: React.ReactNode;
}

interface ThemeTokenInputCardProps {
  tokenKey: string;
  value: string;
  readOnly?: boolean;
  onChange: (nextValue: string) => void;
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

interface AppearanceThemeEditorViewProps {
  customTheme: CustomThemeDocument;
  tokenEditorMode: ResolvedThemeMode;
  activeModeLabel: string;
  activeAppearanceMode: ResolvedThemeMode;
  editorPresetId: ColorPreset;
  editorAppearanceDescription: string;
  editorAccentColor: string;
  theme: Theme;
  terminalTheme: string;
  editorFontSize: number;
  editorFontFamily: string;
  editorLineHeight: number;
  onBack: () => void;
  onTokenEditorModeChange: (mode: ResolvedThemeMode) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onUpdateTokens: (mode: ResolvedThemeMode, updates: Record<string, string>) => void;
  SelectionBadge: React.ComponentType<AppearanceSelectionBadgeProps>;
  ThemeTokenCard: React.ComponentType<ThemeTokenInputCardProps>;
  PresetPreview: React.ComponentType<ColorPresetPreviewProps>;
  EditorPreview: React.ComponentType<EditorSamplePreviewProps>;
}

export function AppearanceThemeEditorView({
  customTheme,
  tokenEditorMode,
  activeModeLabel,
  activeAppearanceMode,
  editorPresetId,
  editorAppearanceDescription,
  editorAccentColor,
  theme,
  terminalTheme,
  editorFontSize,
  editorFontFamily,
  editorLineHeight,
  onBack,
  onTokenEditorModeChange,
  onRename,
  onDelete,
  onUpdateTokens,
  SelectionBadge,
  ThemeTokenCard,
  PresetPreview,
  EditorPreview,
}: AppearanceThemeEditorViewProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div className="control-panel overflow-hidden rounded-xl p-4 md:p-5">
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
                <ChevronLeft className="h-4 w-4" />
                {t('Back to appearance')}
              </Button>
              <div>
                <h3 className="text-lg font-medium">{t('Theme editor')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('Edit the active custom theme in a dedicated workspace.')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={tokenEditorMode === 'light' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onTokenEditorModeChange('light')}
              >
                {t('Light')}
              </Button>
              <Button
                variant={tokenEditorMode === 'dark' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onTokenEditorModeChange('dark')}
              >
                {t('Dark')}
              </Button>
            </div>
          </div>

          <div className="control-panel-muted space-y-4 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[16rem] flex-1">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {t('Name')}
                </p>
                <Input
                  value={customTheme.name}
                  onChange={(event) => onRename(event.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SelectionBadge tone="current">{t('Editing')}</SelectionBadge>
                <SelectionBadge tone="muted">{activeModeLabel}</SelectionBadge>
                <SelectionBadge tone="muted">
                  {customTheme.sourceType === 'blank'
                    ? t('Blank base')
                    : t('Based on {{name}}', {
                        name: t(getColorPresetOption(editorPresetId).label),
                      })}
                </SelectionBadge>
                <Button variant="outline" size="sm" onClick={onDelete}>
                  {t('Delete')}
                </Button>
              </div>
            </div>

            <p className="text-sm leading-6 text-muted-foreground">
              {t(
                'Changes apply immediately to the current theme preview while semantic status tokens remain protected.'
              )}
            </p>
          </div>

          {APP_THEME_TOKEN_GROUPS.map((group) => (
            <div key={group.id} className="control-panel-muted space-y-3 rounded-xl p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{t(group.label)}</p>
                <SelectionBadge tone="muted">
                  {t('{{count}} tokens', { count: group.keys.length })}
                </SelectionBadge>
              </div>
              {group.id === 'status' ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {t(
                    'Status tokens inherit from the preset semantic family to preserve operational meaning.'
                  )}
                </p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.keys.map((tokenKey) => {
                  const value = customTheme.tokens[tokenEditorMode][tokenKey];
                  const readOnly = protectedThemeTokenKeys.has(tokenKey);

                  return (
                    <ThemeTokenCard
                      key={`${group.id}-${tokenKey}`}
                      tokenKey={tokenKey}
                      value={value}
                      readOnly={readOnly}
                      onChange={(nextValue) =>
                        onUpdateTokens(tokenEditorMode, { [tokenKey]: nextValue })
                      }
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="control-panel rounded-xl p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-medium">{customTheme.name}</p>
              <SelectionBadge tone="current">{t('Editing')}</SelectionBadge>
              <SelectionBadge tone="muted">{activeModeLabel}</SelectionBadge>
              <SelectionBadge tone="muted">{t('Custom')}</SelectionBadge>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {editorAppearanceDescription}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[15rem]">
            {[
              {
                label: t('Theme'),
                color: customTheme.tokens[activeAppearanceMode].primary,
              },
              {
                label: t('Accent'),
                color: customTheme.tokens[activeAppearanceMode].accent,
              },
              {
                label: t('Support'),
                color: customTheme.tokens[activeAppearanceMode].support,
              },
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
            presetId={editorPresetId}
            mode={activeAppearanceMode}
            accentColor={editorAccentColor}
            customTheme={customTheme}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('Editor preview')}</p>
            <EditorPreview
              theme={theme}
              terminalTheme={terminalTheme}
              colorPreset={editorPresetId}
              accentColor={editorAccentColor}
              customTheme={customTheme}
              fontSize={editorFontSize}
              fontFamily={editorFontFamily}
              lineHeight={editorLineHeight}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
