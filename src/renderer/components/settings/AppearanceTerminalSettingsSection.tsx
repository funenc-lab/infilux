import { ChevronLeft, ChevronRight } from 'lucide-react';
import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/i18n';
import type { XtermTheme } from '@/lib/ghosttyTheme';
import type { FontWeight } from '@/stores/settings';
import { fontWeightOptions } from './constants';

interface ThemeComboboxProps {
  value: string;
  onValueChange: (value: string | null) => void;
  themes: string[];
  favoriteThemes: string[];
  onToggleFavorite: (theme: string) => void;
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: (checked: boolean) => void;
  showEmptyFavoritesHint?: boolean;
}

interface TerminalPreviewProps {
  theme: XtermTheme;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
}

interface AppearanceTerminalSettingsSectionProps {
  terminalPreviewTheme: XtermTheme;
  localFontSize: number;
  localFontFamily: string;
  terminalFontWeight: string;
  terminalFontWeightBold: string;
  terminalTheme: string;
  displayThemes: string[];
  favoriteTerminalThemes: string[];
  showFavoritesOnly: boolean;
  showEmptyFavoritesHint: boolean;
  onPrevTheme: () => void;
  onNextTheme: () => void;
  onThemeChange: (value: string | null) => void;
  onToggleFavoriteTheme: (theme: string) => void;
  onShowFavoritesOnlyChange: (checked: boolean) => void;
  onFontFamilyChange: (value: string) => void;
  onFontFamilyCommit: () => void;
  onFontSizeChange: (value: number) => void;
  onFontSizeCommit: () => void;
  onFontWeightChange: (value: FontWeight) => void;
  onFontWeightBoldChange: (value: FontWeight) => void;
  ThemeSelector: React.ComponentType<ThemeComboboxProps>;
  TerminalPreview: React.ComponentType<TerminalPreviewProps>;
}

export function AppearanceTerminalSettingsSection({
  terminalPreviewTheme,
  localFontSize,
  localFontFamily,
  terminalFontWeight,
  terminalFontWeightBold,
  terminalTheme,
  displayThemes,
  favoriteTerminalThemes,
  showFavoritesOnly,
  showEmptyFavoritesHint,
  onPrevTheme,
  onNextTheme,
  onThemeChange,
  onToggleFavoriteTheme,
  onShowFavoritesOnlyChange,
  onFontFamilyChange,
  onFontFamilyCommit,
  onFontSizeChange,
  onFontSizeCommit,
  onFontWeightChange,
  onFontWeightBoldChange,
  ThemeSelector,
  TerminalPreview,
}: AppearanceTerminalSettingsSectionProps) {
  const { t } = useI18n();
  const resolvedFontFamily = localFontFamily.trim()
    ? localFontFamily
    : 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

  return (
    <>
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Terminal')}</h3>
        <p className="text-sm text-muted-foreground">{t('Terminal appearance')}</p>
      </div>

      <div className="space-y-4">
        <div className="control-panel rounded-xl p-4 md:p-5">
          <div className="mb-3">
            <p className="text-base font-medium">{t('Terminal theme')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('Choose a Ghostty color scheme.')}
            </p>
          </div>
          <div className="settings-field-row">
            <span className="text-sm font-medium">{t('Color scheme')}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={onPrevTheme}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <ThemeSelector
                  value={terminalTheme}
                  onValueChange={onThemeChange}
                  themes={displayThemes}
                  favoriteThemes={favoriteTerminalThemes}
                  onToggleFavorite={onToggleFavoriteTheme}
                  showFavoritesOnly={showFavoritesOnly}
                  onShowFavoritesOnlyChange={onShowFavoritesOnlyChange}
                  showEmptyFavoritesHint={showEmptyFavoritesHint}
                />
              </div>
              <Button variant="outline" size="icon" onClick={onNextTheme}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="control-panel-muted rounded-xl p-4">
          <div className="mb-3">
            <p className="text-sm font-medium">{t('Preview')}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('Preview the active terminal theme.')}
            </p>
          </div>
          <TerminalPreview
            theme={terminalPreviewTheme}
            fontSize={localFontSize}
            fontFamily={resolvedFontFamily}
            fontWeight={terminalFontWeight}
          />
        </div>

        <Collapsible className="control-panel-muted rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('Typography')}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('Adjust terminal typography when you need a denser or more readable shell.')}
              </p>
            </div>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 [[data-panel-open]_&]:rotate-90" />
              {t('Advanced')}
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="mt-4 space-y-3">
            <div className="settings-field-row">
              <span className="text-sm font-medium">{t('Font')}</span>
              <Input
                value={localFontFamily}
                onChange={(e) => onFontFamilyChange(e.target.value)}
                onBlur={onFontFamilyCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onFontFamilyCommit();
                    e.currentTarget.blur();
                  }
                }}
                placeholder="JetBrains Mono, monospace"
              />
            </div>

            <div className="settings-field-row">
              <span className="text-sm font-medium">{t('Font size')}</span>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={localFontSize}
                  onChange={(e) => onFontSizeChange(Number(e.target.value))}
                  onBlur={onFontSizeCommit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onFontSizeCommit();
                      e.currentTarget.blur();
                    }
                  }}
                  min={8}
                  max={32}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">px</span>
              </div>
            </div>

            <div className="settings-field-row">
              <span className="text-sm font-medium">{t('Font weight')}</span>
              <Select
                value={terminalFontWeight}
                onValueChange={(v) => onFontWeightChange(v as FontWeight)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {fontWeightOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>

            <div className="settings-field-row">
              <span className="text-sm font-medium">{t('Bold font weight')}</span>
              <Select
                value={terminalFontWeightBold}
                onValueChange={(v) => onFontWeightBoldChange(v as FontWeight)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {fontWeightOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </>
  );
}
