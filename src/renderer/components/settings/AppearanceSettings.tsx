import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Heart,
  Image as ImageIcon,
  Monitor,
  Moon,
  RefreshCw,
  Sparkles,
  Sun,
  Terminal,
} from 'lucide-react';
import * as React from 'react';
import { resolveEditorVisualPalette, withAlpha } from '@/components/files/editorThemePalette';
import { dispatchBackgroundRefresh } from '@/components/layout/BackgroundLayer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Combobox,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
} from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/i18n';
import {
  APP_COLOR_PRESET_OPTIONS,
  APP_THEME_TOKEN_GROUPS,
  findCustomThemeBySelection,
  getColorPresetOption,
  type ResolvedThemeMode,
  resolveThemeVariables,
} from '@/lib/appTheme';
import {
  defaultDarkTheme,
  getTerminalThemeAccent,
  getThemeNames,
  getXtermTheme,
  isTerminalThemeDark,
  type XtermTheme,
} from '@/lib/ghosttyTheme';
import { cn } from '@/lib/utils';
import {
  type ColorPreset,
  type CustomThemeDocument,
  type FontWeight,
  type Theme,
  useSettingsStore,
} from '@/stores/settings';
import { buildAppearanceColorPresetModel } from './appearanceColorPresetModel';
import { buildAppearanceThemeModel } from './appearanceThemeModel';
import { fontWeightOptions } from './constants';

function resolveAppearancePreviewMode(theme: Theme, terminalTheme: string): ResolvedThemeMode {
  if (theme === 'light') {
    return 'light';
  }

  if (theme === 'dark') {
    return 'dark';
  }

  if (theme === 'sync-terminal') {
    return isTerminalThemeDark(terminalTheme) ? 'dark' : 'light';
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  return 'dark';
}

function resolveAppearanceAccentColor(
  theme: Theme,
  terminalTheme: string,
  customAccentColor: string
): string {
  return theme === 'sync-terminal' ? getTerminalThemeAccent(terminalTheme) : customAccentColor;
}

function applyAppearancePreview({
  theme,
  terminalTheme,
  colorPreset,
  accentColor,
  customTheme,
}: {
  theme: Theme;
  terminalTheme: string;
  colorPreset: ColorPreset;
  accentColor: string;
  customTheme?: CustomThemeDocument | null;
}) {
  const root = document.documentElement;
  const mode = resolveAppearancePreviewMode(theme, terminalTheme);
  const variables = resolveThemeVariables({
    mode,
    preset: colorPreset,
    customAccentColor: accentColor,
    customTheme,
  });

  root.classList.toggle('dark', mode === 'dark');

  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}

function AppearanceSelectionBadge({
  tone,
  children,
}: {
  tone: 'current' | 'preview' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase',
        tone === 'current'
          ? 'border border-foreground/10 bg-foreground text-background'
          : tone === 'preview'
            ? 'border border-border/70 bg-background/80 text-foreground'
            : 'border border-border/70 bg-background/40 text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

function formatThemeTokenLabel(token: string): string {
  return token.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

function mixPreviewColor(sourceColor: string, sourceAmount: number, targetColor: string): string {
  return `color-mix(in oklab, ${sourceColor} ${sourceAmount}%, ${targetColor})`;
}

function fadePreviewColor(color: string, amount: number): string {
  return mixPreviewColor(color, amount, 'transparent');
}

function buildPreviewSurfaceBackground({
  highlightColor,
  highlightAmount,
  highlightStop,
  surfaceColor,
  surfaceAmount,
  baseColor,
  baseAmount,
}: {
  highlightColor: string;
  highlightAmount: number;
  highlightStop: string;
  surfaceColor: string;
  surfaceAmount: number;
  baseColor: string;
  baseAmount: number;
}): string {
  return `linear-gradient(180deg, ${fadePreviewColor(highlightColor, highlightAmount)} 0%, transparent ${highlightStop}), linear-gradient(135deg, ${mixPreviewColor(surfaceColor, surfaceAmount, baseColor)} 0%, ${mixPreviewColor(baseColor, baseAmount, surfaceColor)} 100%)`;
}

function buildPreviewInsetHighlight(color: string, amount: number): string {
  return `inset 0 1px 0 ${fadePreviewColor(color, amount)}`;
}

function buildPreviewAmbientShadow(color: string, amount: number, geometry: string): string {
  return `${geometry} ${fadePreviewColor(color, amount)}`;
}

function ThemeModeBrowserCard({
  label,
  description,
  icon: Icon,
  mode,
  terminalTheme,
  colorPreset,
  customAccentColor,
  customTheme,
  isSelected,
  isPreviewing,
  onSelect,
  onPreview,
}: {
  label: string;
  description: string;
  icon: React.ElementType;
  mode: Exclude<Theme, 'sync-terminal'>;
  terminalTheme: string;
  colorPreset: ColorPreset;
  customAccentColor: string;
  customTheme?: CustomThemeDocument | null;
  isSelected: boolean;
  isPreviewing: boolean;
  onSelect: () => void;
  onPreview: () => void;
}) {
  const resolvedMode = React.useMemo(
    () => resolveAppearancePreviewMode(mode, terminalTheme),
    [mode, terminalTheme]
  );
  const resolvedAccentColor = React.useMemo(
    () => resolveAppearanceAccentColor(mode, terminalTheme, customAccentColor),
    [customAccentColor, mode, terminalTheme]
  );
  const palette = React.useMemo(
    () =>
      resolveThemeVariables({
        mode: resolvedMode,
        preset: colorPreset,
        customAccentColor: resolvedAccentColor,
        customTheme,
      }),
    [colorPreset, customTheme, resolvedAccentColor, resolvedMode]
  );
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onPreview}
      onFocus={onPreview}
      className="group relative overflow-hidden rounded-[1.35rem] border p-4 text-left transition-all duration-200"
      style={{
        borderColor: isSelected
          ? palette['--ring']
          : isPreviewing
            ? palette['--border']
            : 'color-mix(in oklab, var(--border) 88%, transparent)',
        background: buildPreviewSurfaceBackground({
          highlightColor: palette['--primary'],
          highlightAmount: 10,
          highlightStop: '24%',
          surfaceColor: palette['--card'],
          surfaceAmount: 84,
          baseColor: palette['--background'],
          baseAmount: 72,
        }),
        boxShadow: isSelected
          ? `${buildPreviewInsetHighlight(palette['--foreground'], 10)}, ${buildPreviewAmbientShadow(palette['--muted'], 52, '0 18px 32px')}`
          : buildPreviewInsetHighlight(palette['--foreground'], 3),
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-4 top-0 h-px opacity-80"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${palette['--primary']} 18%, ${palette['--support']} 82%, transparent 100%)`,
        }}
      />

      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border"
          style={{
            backgroundColor: mixPreviewColor(palette['--accent'], 66, palette['--background']),
            borderColor: mixPreviewColor(palette['--border'], 75, palette['--background']),
            color: palette['--foreground'],
          }}
        >
          <Icon className="h-4 w-4" />
        </div>

        {isSelected ? (
          <AppearanceSelectionBadge tone="current">{t('Current')}</AppearanceSelectionBadge>
        ) : isPreviewing ? (
          <AppearanceSelectionBadge tone="preview">{t('Preview')}</AppearanceSelectionBadge>
        ) : null}
      </div>

      <div className="mt-4 min-w-0">
        <p
          className="text-sm font-semibold tracking-[-0.01em]"
          style={{ color: palette['--foreground'] }}
        >
          {label}
        </p>
        <p
          className="mt-1 text-xs leading-5"
          style={{ color: `color-mix(in oklab, ${palette['--foreground']} 58%, transparent)` }}
        >
          {description}
        </p>
      </div>

      <div className="mt-4">
        <ColorPresetMiniCard
          presetId={colorPreset}
          mode={resolvedMode}
          accentColor={resolvedAccentColor}
          customTheme={customTheme}
        />
      </div>
    </button>
  );
}

function ColorPresetMiniCard({
  presetId,
  mode,
  accentColor,
  customTheme,
}: {
  presetId: ColorPreset;
  mode: ResolvedThemeMode;
  accentColor: string;
  customTheme?: CustomThemeDocument | null;
}) {
  const palette = React.useMemo(
    () =>
      resolveThemeVariables({
        mode,
        preset: presetId,
        customAccentColor: accentColor,
        customTheme,
      }),
    [accentColor, customTheme, mode, presetId]
  );
  const support = palette['--support'];

  return (
    <div
      className="mt-3 overflow-hidden rounded-[1rem] border"
      style={{
        background: `linear-gradient(180deg, color-mix(in oklab, ${palette['--foreground']} 3%, transparent) 0%, transparent 30%), ${palette['--background']}`,
        borderColor: palette['--border'],
        boxShadow: `inset 0 1px 0 color-mix(in oklab, ${palette['--foreground']} 6%, transparent)`,
      }}
    >
      <div
        className="h-1"
        style={{
          background: `linear-gradient(90deg, ${palette['--primary']} 0%, ${palette['--accent']} 100%)`,
        }}
      />
      <div className="grid grid-cols-[0.92fr_1.08fr] gap-2 p-2.5">
        <div
          className="rounded-[0.9rem] border p-2"
          style={{
            backgroundColor: mixPreviewColor(palette['--secondary'], 86, palette['--background']),
            borderColor: palette['--border'],
          }}
        >
          <div
            className="h-1.5 w-8 rounded-full"
            style={{ backgroundColor: palette['--foreground'], opacity: 0.8 }}
          />
          <div className="mt-2 space-y-1">
            <div
              className="h-1.5 rounded-full"
              style={{
                backgroundColor: palette['--muted-foreground'],
                opacity: 0.35,
              }}
            />
            <div
              className="h-1.5 w-2/3 rounded-full"
              style={{
                backgroundColor: palette['--muted-foreground'],
                opacity: 0.25,
              }}
            />
          </div>
        </div>
        <div
          className="rounded-[0.9rem] border p-2"
          style={{
            backgroundColor: mixPreviewColor(palette['--card'], 92, palette['--background']),
            borderColor: palette['--border'],
          }}
        >
          <div className="flex items-center justify-between">
            <div
              className="h-1.5 w-9 rounded-full"
              style={{
                backgroundColor: palette['--foreground'],
                opacity: 0.78,
              }}
            />
            <div className="flex items-center gap-1">
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                style={{
                  backgroundColor: palette['--primary'],
                  color: palette['--primary-foreground'],
                }}
              >
                AI
              </span>
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: support }} />
            </div>
          </div>
          <div className="mt-2 h-5 rounded-md" style={{ backgroundColor: palette['--muted'] }} />
        </div>
      </div>
    </div>
  );
}

function ColorPresetPreview({
  presetId,
  mode,
  accentColor,
  customTheme,
}: {
  presetId: (typeof APP_COLOR_PRESET_OPTIONS)[number]['id'];
  mode: ResolvedThemeMode;
  accentColor: string;
  customTheme?: CustomThemeDocument | null;
}) {
  const palette = React.useMemo(
    () =>
      resolveThemeVariables({
        mode,
        preset: presetId,
        customAccentColor: accentColor,
        customTheme,
      }),
    [accentColor, customTheme, mode, presetId]
  );

  const background = palette['--background'];
  const foreground = palette['--foreground'];
  const card = palette['--card'];
  const secondary = palette['--secondary'];
  const muted = palette['--muted'];
  const mutedForeground = palette['--muted-foreground'];
  const border = palette['--border'];
  const primary = palette['--primary'];
  const accent = palette['--accent'];
  const accentForeground = palette['--accent-foreground'];
  const primaryForeground = palette['--primary-foreground'];
  const support = palette['--support'];
  const supportForeground = palette['--support-foreground'];
  const success = palette['--success'];
  const warning = palette['--warning'];
  const info = palette['--info'];

  return (
    <div
      className="relative overflow-hidden rounded-[1.05rem] border"
      style={{
        backgroundColor: background,
        borderColor: border,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-12 opacity-70"
        style={{
          background: `linear-gradient(180deg, ${accent} 0%, transparent 100%)`,
        }}
      />

      <div className="relative flex h-32 overflow-hidden md:h-36">
        <div
          className="flex w-[34%] flex-col gap-2 border-r px-3 py-3"
          style={{
            backgroundColor: secondary,
            borderColor: border,
          }}
        >
          <div
            className="h-2.5 w-14 rounded-full"
            style={{ backgroundColor: foreground, opacity: 0.9 }}
          />
          <div
            className="rounded-lg border px-2.5 py-2"
            style={{
              backgroundColor: card,
              borderColor: border,
              boxShadow: `0 1px 0 ${border}`,
            }}
          >
            <div
              className="mb-1.5 h-2 w-11 rounded-full"
              style={{ backgroundColor: foreground, opacity: 0.82 }}
            />
            <div className="flex flex-wrap gap-1">
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                style={{
                  backgroundColor: primary,
                  color: primaryForeground,
                }}
              >
                AI
              </span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                style={{
                  backgroundColor: accent,
                  color: accentForeground,
                }}
              >
                Live
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`sidebar-row-${index + 1}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5"
                style={{
                  backgroundColor: index === 1 ? accent : 'transparent',
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: index === 1 ? primary : mutedForeground,
                    opacity: index === 1 ? 1 : 0.65,
                  }}
                />
                <span
                  className="h-1.5 rounded-full"
                  style={{
                    width: index === 0 ? '60%' : index === 1 ? '72%' : '52%',
                    backgroundColor: index === 1 ? accentForeground : foreground,
                    opacity: index === 1 ? 0.92 : 0.48,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-3 py-3">
          <div
            className="flex items-center justify-between rounded-lg border px-2.5 py-2"
            style={{
              backgroundColor: card,
              borderColor: border,
            }}
          >
            <div className="space-y-1">
              <div
                className="h-2 w-18 rounded-full"
                style={{ backgroundColor: foreground, opacity: 0.88 }}
              />
              <div
                className="h-1.5 w-24 rounded-full"
                style={{ backgroundColor: mutedForeground, opacity: 0.6 }}
              />
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[8px] font-semibold"
              style={{
                backgroundColor: primary,
                color: primaryForeground,
              }}
            >
              Ready
            </span>
          </div>

          <div
            className="rounded-xl border p-2.5"
            style={{
              backgroundColor: card,
              borderColor: border,
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <div
                className="h-2.5 w-20 rounded-full"
                style={{ backgroundColor: foreground, opacity: 0.86 }}
              />
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: primary }} />
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: support }} />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="h-7 rounded-lg" style={{ backgroundColor: muted }} />
              <div className="grid grid-cols-[1.4fr_0.9fr] gap-1.5">
                <div
                  className="h-9 rounded-lg border"
                  style={{
                    backgroundColor: accent,
                    borderColor: border,
                  }}
                />
                <div
                  className="h-9 rounded-lg border"
                  style={{
                    backgroundColor: support,
                    borderColor: border,
                  }}
                />
              </div>
              <div
                className="flex items-center justify-between rounded-lg border px-2 py-1.5"
                style={{
                  backgroundColor: card,
                  borderColor: border,
                }}
              >
                <span
                  className="rounded-full px-1.5 py-0.5 text-[8px] font-semibold"
                  style={{
                    backgroundColor: support,
                    color: supportForeground,
                  }}
                >
                  Assist
                </span>
                <div className="flex items-center gap-1">
                  {[success, warning, info].map((color) => (
                    <span
                      key={color}
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalPreview({
  theme,
  fontSize,
  fontFamily,
  fontWeight,
}: {
  theme: XtermTheme;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
}) {
  const sampleLines = [
    { id: 'prompt1', text: '$ ', color: theme.green },
    { id: 'cmd1', text: 'ls -la', color: theme.foreground },
    { id: 'nl1', text: '\n' },
    { id: 'perm1', text: 'drwxr-xr-x  ', color: theme.blue },
    { id: 'meta1', text: '5 user staff  160 Dec 23 ', color: theme.foreground },
    { id: 'dir1', text: 'Documents', color: theme.cyan },
    { id: 'nl2', text: '\n' },
    { id: 'perm2', text: '-rw-r--r--  ', color: theme.foreground },
    { id: 'meta2', text: '1 user staff 2048 Dec 22 ', color: theme.foreground },
    { id: 'file1', text: 'config.json', color: theme.yellow },
    { id: 'nl3', text: '\n' },
    { id: 'perm3', text: '-rwxr-xr-x  ', color: theme.foreground },
    { id: 'meta3', text: '1 user staff  512 Dec 21 ', color: theme.foreground },
    { id: 'file2', text: 'script.sh', color: theme.green },
    { id: 'nl4', text: '\n\n' },
    { id: 'prompt2', text: '$ ', color: theme.green },
    { id: 'cmd2', text: 'echo "Hello, World!"', color: theme.foreground },
    { id: 'nl5', text: '\n' },
    { id: 'output1', text: 'Hello, World!', color: theme.magenta },
  ];

  return (
    <div
      className="rounded-lg border p-4 h-40 overflow-auto"
      style={{
        backgroundColor: theme.background,
        fontSize: `${fontSize}px`,
        fontFamily,
        fontWeight,
      }}
    >
      {sampleLines.map((segment) =>
        segment.text === '\n' ? (
          <br key={segment.id} />
        ) : segment.text === '\n\n' ? (
          <React.Fragment key={segment.id}>
            <br />
            <br />
          </React.Fragment>
        ) : (
          <span key={segment.id} style={{ color: segment.color }}>
            {segment.text}
          </span>
        )
      )}
      <span
        className="inline-block w-2 h-4 animate-pulse"
        style={{ backgroundColor: theme.cursor }}
      />
    </div>
  );
}

function EditorSamplePreview({
  theme,
  terminalTheme,
  colorPreset,
  accentColor,
  customTheme,
  fontSize,
  fontFamily,
  lineHeight,
}: {
  theme: Theme;
  terminalTheme: string;
  colorPreset: ColorPreset;
  accentColor: string;
  customTheme?: CustomThemeDocument | null;
  fontSize: number;
  fontFamily: string;
  lineHeight: number;
}) {
  const palette = React.useMemo(
    () =>
      resolveEditorVisualPalette({
        theme,
        terminalTheme,
        colorPreset,
        customAccentColor: accentColor,
        customTheme,
      }),
    [accentColor, colorPreset, customTheme, terminalTheme, theme]
  );

  const sampleLines = [
    [
      { text: 'export ', color: palette.keyword },
      { text: 'function ', color: palette.keyword },
      { text: 'syncTheme', color: palette.function },
      { text: '(', color: palette.punctuation },
      { text: 'preset', color: palette.variable },
      { text: ': ', color: palette.punctuation },
      { text: 'ThemePreset', color: palette.type },
      { text: ') {', color: palette.punctuation },
    ],
    [{ text: '  // Editor readability stays calm', color: palette.comment }],
    [
      { text: '  const ', color: palette.keyword },
      { text: 'accent', color: palette.variable },
      { text: ' = ', color: palette.punctuation },
      { text: 'preset', color: palette.variable },
      { text: '.', color: palette.punctuation },
      { text: 'accent', color: palette.constant },
      { text: ';', color: palette.punctuation },
    ],
    [
      { text: '  return ', color: palette.keyword },
      { text: '{', color: palette.punctuation },
      { text: ' focus', color: palette.variable },
      { text: ': ', color: palette.punctuation },
      { text: 'accent', color: palette.variable },
      { text: ', preview', color: palette.variable },
      { text: ': ', color: palette.punctuation },
      { text: '"live"', color: palette.string },
      { text: ' };', color: palette.punctuation },
    ],
    [{ text: '}', color: palette.punctuation }],
  ];

  return (
    <div
      className="overflow-hidden rounded-[1.05rem] border"
      style={{
        backgroundColor: palette.background,
        borderColor: palette.indentGuide,
        boxShadow: `0 18px 40px ${withAlpha(palette.punctuation, '10')}`,
      }}
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2"
        style={{
          backgroundColor: withAlpha(palette.lineHighlight, 'cc'),
          borderColor: palette.indentGuide,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: palette.constant }}
          />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette.number }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: palette.string }} />
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: withAlpha(palette.accent, '24'),
            color: palette.accent,
          }}
        >
          settings/theme.ts
        </span>
      </div>

      <div className="px-0 py-2" style={{ fontFamily, fontSize: `${fontSize}px`, lineHeight }}>
        {sampleLines.map((segments, index) => {
          const isActiveLine = index === 2;

          return (
            <div
              key={`editor-sample-line-${index + 1}`}
              className="grid grid-cols-[2.8rem_1fr] items-start px-3"
              style={{
                backgroundColor: isActiveLine ? palette.lineHighlight : 'transparent',
                borderLeft: isActiveLine ? `2px solid ${palette.accent}` : '2px solid transparent',
              }}
            >
              <div
                className="select-none pr-3 pt-0.5 text-right text-[0.82em]"
                style={{ color: palette.lineNumber }}
              >
                {index + 1}
              </div>
              <div className="min-w-0 overflow-hidden py-0.5">
                {segments.map((segment, segmentIndex) => (
                  <span
                    key={`editor-sample-segment-${index + 1}-${segmentIndex + 1}`}
                    style={{ color: segment.color }}
                  >
                    {segment.text}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function describeCustomTheme(
  customTheme: CustomThemeDocument,
  fallbackPreset: ColorPreset
): string {
  if (customTheme.sourceType === 'blank') {
    return 'Custom theme built from a blank starting point.';
  }

  return `Custom theme derived from ${getColorPresetOption(customTheme.sourcePresetId ?? fallbackPreset).label}.`;
}

function ThemeTokenInputCard({
  tokenKey,
  value,
  onChange,
}: {
  tokenKey: string;
  value: string;
  onChange: (nextValue: string) => void;
}) {
  return (
    <div
      className="rounded-[1.05rem] border border-border/70 p-3"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--foreground) 2%, transparent) 0%, transparent 24%), color-mix(in oklab, var(--background) 84%, transparent)',
        boxShadow: buildPreviewInsetHighlight('var(--foreground)', 3),
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {formatThemeTokenLabel(tokenKey)}
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/90">{value}</p>
        </div>
        <div
          className="h-11 w-11 shrink-0 rounded-[0.95rem] border"
          style={{
            backgroundColor: value,
            borderColor: fadePreviewColor('var(--foreground)', 10),
            boxShadow: buildPreviewInsetHighlight('var(--foreground)', 18),
          }}
        />
      </div>

      <div className="mt-3">
        <Input value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </div>
  );
}

function FavoriteButton({
  isFavorite,
  onClick,
  className,
  ariaLabel,
}: {
  isFavorite: boolean;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={isFavorite}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      className={cn('p-1 hover:text-red-500 transition-colors', className)}
    >
      {isFavorite ? (
        <Heart className="h-4 w-4 fill-red-500 text-red-500" />
      ) : (
        <Heart className="h-4 w-4" />
      )}
    </button>
  );
}

function ThemeCombobox({
  value,
  onValueChange,
  themes,
  favoriteThemes,
  onToggleFavorite,
  onThemeHover,
  showFavoritesOnly,
  onShowFavoritesOnlyChange,
  showEmptyFavoritesHint,
}: {
  value: string;
  onValueChange: (value: string | null) => void;
  themes: string[];
  favoriteThemes: string[];
  onToggleFavorite: (theme: string) => void;
  onThemeHover?: (theme: string) => void;
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: (checked: boolean) => void;
  showEmptyFavoritesHint?: boolean;
}) {
  const { t } = useI18n();
  // 使用内部值与外部值解耦，防止悬停时下拉框关闭
  const [internalValue, setInternalValue] = React.useState(value);
  const [search, setSearch] = React.useState(value);
  const [isOpen, setIsOpen] = React.useState(false);
  const hoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listRef = React.useRef<HTMLDivElement>(null);
  const originalValueRef = React.useRef<string>(value);
  const explicitSelectionRef = React.useRef(false);

  // 性能优化：使用 Set 替代数组查找
  const favoriteSet = React.useMemo(() => new Set(favoriteThemes), [favoriteThemes]);

  // 仅在下拉框关闭时同步外部值
  React.useEffect(() => {
    if (!isOpen) {
      setInternalValue(value);
      setSearch(value);
    }
  }, [value, isOpen]);

  const filteredThemes = React.useMemo(() => {
    if (!search || search === internalValue) return themes;
    const query = search.toLowerCase();
    return themes.filter((name) => name.toLowerCase().includes(query));
  }, [themes, search, internalValue]);

  const handleValueChange = (newValue: string | null) => {
    if (newValue) {
      explicitSelectionRef.current = true;
      setInternalValue(newValue);
      setSearch(newValue);
    }
    onValueChange(newValue);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      originalValueRef.current = value;
      explicitSelectionRef.current = false;
      setInternalValue(value);
      setSearch(value);
    } else {
      // 关闭时如果没有显式选择，恢复原始主题
      if (!explicitSelectionRef.current) {
        onThemeHover?.(originalValueRef.current);
      }
    }
  };

  const handleItemMouseEnter = (themeName: string) => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      onThemeHover?.(themeName);
    }, 50);
  };

  const handleItemMouseLeave = () => {
    clearTimeout(hoverTimeoutRef.current);
  };

  // 键盘导航处理 - 使用捕获阶段监听，确保在输入框处理之前捕获事件
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // 使用 requestAnimationFrame 确保 Combobox 完成高亮状态更新后再查询
        requestAnimationFrame(() => {
          const highlighted = listRef.current?.querySelector('[data-highlighted]');
          if (highlighted) {
            const themeName = highlighted.getAttribute('data-value');
            if (themeName) {
              onThemeHover?.(themeName);
            }
          }
        });
      }
    };

    // 使用 capture: true 在捕获阶段监听，确保事件不会被输入框拦截
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onThemeHover]);

  React.useEffect(() => {
    return () => {
      clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  return (
    <Combobox<string>
      value={internalValue}
      onValueChange={handleValueChange}
      inputValue={search}
      onInputValueChange={setSearch}
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      <div className="relative">
        <ComboboxInput placeholder={t('Search themes...')} />
        <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          <Checkbox
            id="show-favorites-only-inner"
            checked={showFavoritesOnly}
            onCheckedChange={(checked) => onShowFavoritesOnlyChange(checked === true)}
            onClick={(e) => e.stopPropagation()}
          />
          <label
            htmlFor="show-favorites-only-inner"
            className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {t('Show favorites only')}
          </label>
        </div>
      </div>
      <ComboboxPopup>
        <ComboboxList ref={listRef}>
          {filteredThemes.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {showEmptyFavoritesHint
                ? t('No favorite themes yet. Click the heart icon to add favorites.')
                : t('No themes found')}
            </div>
          )}
          {filteredThemes.map((name) => (
            <ComboboxItem
              key={name}
              value={name}
              data-value={name}
              onMouseEnter={() => handleItemMouseEnter(name)}
              onMouseLeave={handleItemMouseLeave}
              endAddon={
                <FavoriteButton
                  isFavorite={favoriteSet.has(name)}
                  onClick={() => onToggleFavorite(name)}
                  ariaLabel={
                    favoriteSet.has(name) ? t('Remove from favorites') : t('Add to favorites')
                  }
                />
              }
            >
              {name}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}

export function AppearanceSettings() {
  const {
    theme,
    setTheme,
    colorPreset,
    customAccentColor,
    setCustomAccentColor,
    activeThemeSelection,
    customThemes,
    setActivePresetTheme,
    setActiveCustomTheme,
    createCustomThemeFromPreset,
    createBlankCustomTheme,
    renameCustomTheme,
    deleteCustomTheme,
    updateCustomThemeTokens,
    terminalTheme,
    setTerminalTheme,
    terminalFontSize: globalFontSize,
    setTerminalFontSize,
    terminalFontFamily: globalFontFamily,
    setTerminalFontFamily,
    terminalFontWeight,
    setTerminalFontWeight,
    terminalFontWeightBold,
    setTerminalFontWeightBold,
    editorSettings,
    glowEffectEnabled,
    setGlowEffectEnabled,
    backgroundImageEnabled,
    setBackgroundImageEnabled,
    backgroundImagePath,
    setBackgroundImagePath,
    backgroundUrlPath,
    setBackgroundUrlPath,
    backgroundFolderPath,
    setBackgroundFolderPath,
    backgroundSourceType,
    setBackgroundSourceType,
    backgroundRandomEnabled,
    setBackgroundRandomEnabled,
    backgroundRandomInterval,
    setBackgroundRandomInterval,
    backgroundOpacity,
    setBackgroundOpacity,
    backgroundBlur,
    setBackgroundBlur,
    backgroundBrightness,
    setBackgroundBrightness,
    backgroundSaturation,
    setBackgroundSaturation,
    backgroundSizeMode,
    setBackgroundSizeMode,
    favoriteTerminalThemes,
    toggleFavoriteTerminalTheme,
  } = useSettingsStore();
  const { t } = useI18n();
  const [livePreviewTheme, setLivePreviewTheme] = React.useState<Theme | null>(null);
  const [previewPreset, setPreviewPreset] = React.useState<ColorPreset | null>(null);
  const [previewCustomThemeId, setPreviewCustomThemeId] = React.useState<string | null>(null);
  const [tokenEditorMode, setTokenEditorMode] = React.useState<ResolvedThemeMode>('dark');
  const themeModel = React.useMemo(() => buildAppearanceThemeModel({ theme, t }), [theme, t]);
  const effectivePreviewTheme = livePreviewTheme ?? theme;
  const activeCustomTheme = React.useMemo(
    () => findCustomThemeBySelection(customThemes, activeThemeSelection),
    [activeThemeSelection, customThemes]
  );
  const previewCustomTheme = React.useMemo(
    () => customThemes.find((entry) => entry.id === previewCustomThemeId) ?? null,
    [customThemes, previewCustomThemeId]
  );
  const effectivePreviewCustomTheme = previewCustomTheme ?? activeCustomTheme;
  const effectivePreviewPreset = previewPreset ?? colorPreset;
  const livePreviewActive =
    livePreviewTheme !== null || previewPreset !== null || previewCustomThemeId !== null;
  const colorPreviewMode = React.useMemo(
    () => resolveAppearancePreviewMode(effectivePreviewTheme, terminalTheme),
    [effectivePreviewTheme, terminalTheme]
  );
  const themeModeIcons: Record<Exclude<Theme, 'sync-terminal'>, React.ElementType> = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  // Local state for inputs
  const [localFontSize, setLocalFontSize] = React.useState(globalFontSize);
  const [localFontFamily, setLocalFontFamily] = React.useState(globalFontFamily);
  const [showFavoritesOnly, setShowFavoritesOnly] = React.useState(false);
  const [bgSettingsOpen, setBgSettingsOpen] = React.useState(false);

  // Sync local state with global when global changes externally
  React.useEffect(() => {
    setLocalFontSize(globalFontSize);
  }, [globalFontSize]);

  React.useEffect(() => {
    setLocalFontFamily(globalFontFamily);
  }, [globalFontFamily]);

  // Apply font size change (with validation)
  const applyFontSizeChange = React.useCallback(() => {
    const validFontSize = Math.max(8, Math.min(32, localFontSize || 8));
    if (validFontSize !== localFontSize) {
      setLocalFontSize(validFontSize);
    }
    if (validFontSize !== globalFontSize) {
      setTerminalFontSize(validFontSize);
    }
  }, [localFontSize, globalFontSize, setTerminalFontSize]);

  // Apply font family change (with validation)
  const applyFontFamilyChange = React.useCallback(() => {
    const validFontFamily = localFontFamily.trim() || globalFontFamily;
    if (validFontFamily !== localFontFamily) {
      setLocalFontFamily(validFontFamily);
    }
    if (validFontFamily !== globalFontFamily) {
      setTerminalFontFamily(validFontFamily);
    }
  }, [localFontFamily, globalFontFamily, setTerminalFontFamily]);

  // Get theme names synchronously from embedded data
  const themeNames = React.useMemo(() => getThemeNames(), []);

  // Display themes based on favorites filter
  const displayThemes = React.useMemo(() => {
    if (!showFavoritesOnly) {
      return themeNames;
    }
    const favorites = themeNames.filter((name) => favoriteTerminalThemes.includes(name));
    // 当前选中的非收藏配色临时显示在列表第1位
    if (!favoriteTerminalThemes.includes(terminalTheme)) {
      return [terminalTheme, ...favorites];
    }
    return favorites;
  }, [themeNames, showFavoritesOnly, favoriteTerminalThemes, terminalTheme]);

  const showEmptyFavoritesHint = showFavoritesOnly && favoriteTerminalThemes.length === 0;
  const colorPresetModel = React.useMemo(
    () =>
      buildAppearanceColorPresetModel({
        selectedPresetId: colorPreset,
        presetOptions: APP_COLOR_PRESET_OPTIONS,
      }),
    [colorPreset]
  );
  const selectedPreset = colorPresetModel.selectedPreset;
  const colorInputValue = customAccentColor || selectedPreset.themeHex;
  const presetCardAccentColor = React.useMemo(
    () => resolveAppearanceAccentColor(effectivePreviewTheme, terminalTheme, customAccentColor),
    [customAccentColor, effectivePreviewTheme, terminalTheme]
  );
  const previewAccentColor = React.useMemo(() => {
    if (effectivePreviewCustomTheme) {
      return effectivePreviewCustomTheme.tokens[colorPreviewMode].primary;
    }

    return resolveAppearanceAccentColor(effectivePreviewTheme, terminalTheme, customAccentColor);
  }, [
    colorPreviewMode,
    customAccentColor,
    effectivePreviewCustomTheme,
    effectivePreviewTheme,
    terminalTheme,
  ]);
  const previewedPreset = React.useMemo(
    () =>
      getColorPresetOption(effectivePreviewCustomTheme?.sourcePresetId ?? effectivePreviewPreset) ??
      selectedPreset,
    [effectivePreviewCustomTheme, effectivePreviewPreset, selectedPreset]
  );
  const previewModeLabel = React.useMemo(() => {
    if (effectivePreviewTheme === 'sync-terminal') {
      return t('Sync terminal theme');
    }

    return (
      themeModel.modeOptions.find((option) => option.value === effectivePreviewTheme)?.label ??
      t('System')
    );
  }, [effectivePreviewTheme, t, themeModel.modeOptions]);

  React.useEffect(() => {
    applyAppearancePreview({
      theme: effectivePreviewTheme,
      terminalTheme,
      colorPreset: effectivePreviewPreset,
      accentColor: previewAccentColor,
      customTheme: effectivePreviewCustomTheme,
    });

    return () => {
      applyAppearancePreview({
        theme,
        terminalTheme,
        colorPreset,
        accentColor: resolveAppearanceAccentColor(theme, terminalTheme, customAccentColor),
        customTheme: activeCustomTheme,
      });
    };
  }, [
    activeCustomTheme,
    colorPreset,
    customAccentColor,
    effectivePreviewCustomTheme,
    effectivePreviewPreset,
    effectivePreviewTheme,
    previewAccentColor,
    terminalTheme,
    theme,
  ]);

  // Get preview theme synchronously
  const terminalPreviewTheme = React.useMemo(() => {
    return getXtermTheme(terminalTheme) ?? defaultDarkTheme;
  }, [terminalTheme]);

  const handleThemeChange = (value: string | null) => {
    if (value) {
      setTerminalTheme(value);
    }
  };

  const handlePrevTheme = () => {
    const list = showFavoritesOnly ? displayThemes : themeNames;
    const idx = list.indexOf(terminalTheme);
    const newIndex = idx <= 0 ? list.length - 1 : idx - 1;
    setTerminalTheme(list[newIndex]);
  };

  const handleNextTheme = () => {
    const list = showFavoritesOnly ? displayThemes : themeNames;
    const idx = list.indexOf(terminalTheme);
    const newIndex = idx >= list.length - 1 ? 0 : idx + 1;
    setTerminalTheme(list[newIndex]);
  };

  const handleSelectFile = async () => {
    const path = await window.electronAPI.dialog.openFile({
      filters: [
        {
          name: 'Media',
          extensions: [
            'png',
            'jpg',
            'jpeg',
            'gif',
            'webp',
            'bmp',
            'svg',
            'mp4',
            'webm',
            'ogg',
            'mov',
          ],
        },
      ],
    });
    if (path) {
      setBackgroundImagePath(path);
      setBackgroundSourceType('file');
    }
  };

  const handleSelectFolder = async () => {
    const path = await window.electronAPI.dialog.openDirectory();
    if (path) {
      setBackgroundFolderPath(path);
      setBackgroundSourceType('folder');
    }
  };

  // Active path based on current source type
  const activePath =
    backgroundSourceType === 'folder'
      ? backgroundFolderPath
      : backgroundSourceType === 'url'
        ? backgroundUrlPath
        : backgroundImagePath;
  const setActivePath =
    backgroundSourceType === 'folder'
      ? setBackgroundFolderPath
      : backgroundSourceType === 'url'
        ? setBackgroundUrlPath
        : setBackgroundImagePath;
  const effectivePreviewDescription = effectivePreviewCustomTheme
    ? describeCustomTheme(
        effectivePreviewCustomTheme,
        effectivePreviewCustomTheme.sourcePresetId ?? effectivePreviewPreset
      )
    : previewedPreset.description;
  const tokenEditorTheme = activeCustomTheme;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div
          className="overflow-hidden rounded-[1.65rem] border border-border/70 p-4 md:p-5"
          style={{
            background: buildPreviewSurfaceBackground({
              highlightColor: 'var(--foreground)',
              highlightAmount: 2,
              highlightStop: '18%',
              surfaceColor: 'var(--card)',
              surfaceAmount: 92,
              baseColor: 'var(--background)',
              baseAmount: 90,
            }),
            boxShadow: `${buildPreviewInsetHighlight('var(--foreground)', 3)}, ${buildPreviewAmbientShadow('var(--muted)', 56, '0 28px 50px')}`,
          }}
        >
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium">{t('Theme mode')}</h3>
              <p className="text-sm text-muted-foreground">{t('Choose interface theme')}</p>
            </div>

            <div
              className="grid gap-3 md:grid-cols-3"
              onMouseLeave={() => setLivePreviewTheme(null)}
            >
              {themeModel.modeOptions.map((option) => {
                const OptionIcon = themeModeIcons[option.value];

                return (
                  <ThemeModeBrowserCard
                    key={option.value}
                    label={option.label}
                    description={option.description}
                    icon={OptionIcon}
                    mode={option.value}
                    terminalTheme={terminalTheme}
                    colorPreset={
                      effectivePreviewCustomTheme?.sourcePresetId ?? effectivePreviewPreset
                    }
                    customAccentColor={customAccentColor}
                    customTheme={effectivePreviewCustomTheme}
                    isSelected={themeModel.activeMode === option.value}
                    isPreviewing={livePreviewTheme === option.value}
                    onSelect={() => setTheme(option.value)}
                    onPreview={() => setLivePreviewTheme(option.value)}
                  />
                );
              })}
            </div>

            <div
              className="overflow-hidden rounded-[1.35rem] border border-border/70 p-4"
              style={{
                background: buildPreviewSurfaceBackground({
                  highlightColor: 'var(--foreground)',
                  highlightAmount: 2,
                  highlightStop: '22%',
                  surfaceColor: 'var(--card)',
                  surfaceAmount: 88,
                  baseColor: 'var(--background)',
                  baseAmount: 84,
                }),
                boxShadow: buildPreviewInsetHighlight('var(--foreground)', 3),
              }}
              onMouseEnter={() => setLivePreviewTheme('sync-terminal')}
              onMouseLeave={() => setLivePreviewTheme(null)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-border/70 bg-background/35">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold tracking-[-0.01em]">
                        {t('Sync terminal theme')}
                      </p>
                      {themeModel.terminalSyncEnabled ? (
                        <AppearanceSelectionBadge tone="current">
                          {t('Current')}
                        </AppearanceSelectionBadge>
                      ) : livePreviewTheme === 'sync-terminal' ? (
                        <AppearanceSelectionBadge tone="preview">
                          {t('Preview')}
                        </AppearanceSelectionBadge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t('Use the terminal theme as the app accent source')}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={themeModel.terminalSyncEnabled}
                  onCheckedChange={(checked) =>
                    setTheme(checked ? 'sync-terminal' : themeModel.activeMode)
                  }
                />
              </div>

              {activeThemeSelection.kind === 'preset' ? (
                <div className="mt-4 flex items-center gap-3">
                  <input
                    type="color"
                    value={colorInputValue}
                    onChange={(event) => setCustomAccentColor(event.target.value)}
                    className="h-11 w-14 shrink-0 cursor-pointer rounded-[0.95rem] border border-border bg-transparent p-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        {t('Custom accent')}
                      </p>
                      {customAccentColor ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCustomAccentColor('')}
                        >
                          {t('Reset')}
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-2 rounded-[0.95rem] border border-border/70 bg-background/55 px-3 py-2.5 text-sm text-muted-foreground">
                      {customAccentColor || t('Using {{name}}', { name: selectedPreset.label })}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Custom themes manage their own primary, accent, and support tokens.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium">{t('Color scheme')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('Choose the palette that shapes surfaces, focus states, and brand emphasis.')}
              </p>
            </div>

            <div
              className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
              onMouseLeave={() => setPreviewPreset(null)}
            >
              {colorPresetModel.compactOptions.map((option) => {
                const isSelected =
                  activeThemeSelection.kind === 'preset' &&
                  activeThemeSelection.presetId === option.id;
                const isPreviewing = previewPreset === option.id;
                const optionPalette = resolveThemeVariables({
                  mode: colorPreviewMode,
                  preset: option.id,
                  customAccentColor: previewAccentColor,
                });

                return (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => setActivePresetTheme(option.id)}
                    onMouseEnter={() => setPreviewPreset(option.id)}
                    onFocus={() => setPreviewPreset(option.id)}
                    className="group relative overflow-hidden rounded-[1.35rem] border p-4 text-left transition-all duration-200"
                    style={{
                      borderColor: isSelected
                        ? optionPalette['--ring']
                        : isPreviewing
                          ? optionPalette['--border']
                          : 'color-mix(in oklab, var(--border) 88%, transparent)',
                      background: buildPreviewSurfaceBackground({
                        highlightColor: optionPalette['--primary'],
                        highlightAmount: 10,
                        highlightStop: '22%',
                        surfaceColor: optionPalette['--card'],
                        surfaceAmount: 84,
                        baseColor: optionPalette['--background'],
                        baseAmount: 74,
                      }),
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-semibold tracking-[-0.01em]"
                          style={{ color: optionPalette['--foreground'] }}
                        >
                          {option.label}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {isSelected ? (
                            <AppearanceSelectionBadge tone="current">
                              {t('Current')}
                            </AppearanceSelectionBadge>
                          ) : null}
                          {isPreviewing ? (
                            <AppearanceSelectionBadge tone="preview">
                              {t('Preview')}
                            </AppearanceSelectionBadge>
                          ) : null}
                          {option.recommended ? (
                            <AppearanceSelectionBadge tone="muted">
                              {t('Recommended')}
                            </AppearanceSelectionBadge>
                          ) : null}
                          {option.isDefault ? (
                            <AppearanceSelectionBadge tone="muted">
                              {t('Default')}
                            </AppearanceSelectionBadge>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {[option.themeHex, option.accentHex, option.supportHex].map((color) => (
                          <span
                            key={`${option.id}-${color}`}
                            className="h-3.5 w-3.5 rounded-full border"
                            style={{
                              backgroundColor: color,
                              borderColor: fadePreviewColor(optionPalette['--foreground'], 15),
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <p
                      className="mt-3 text-xs leading-5"
                      style={{
                        color: `color-mix(in oklab, ${optionPalette['--foreground']} 58%, transparent)`,
                      }}
                    >
                      {option.description}
                    </p>

                    <ColorPresetMiniCard
                      presetId={option.id}
                      mode={colorPreviewMode}
                      accentColor={presetCardAccentColor}
                    />
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 rounded-[1.35rem] border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-medium">Custom themes</h3>
                  <p className="text-sm text-muted-foreground">
                    Create blank themes or duplicate a preset into your own theme library.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => createCustomThemeFromPreset(colorPreset)}
                  >
                    Copy current preset
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => createBlankCustomTheme()}>
                    New blank
                  </Button>
                </div>
              </div>

              {customThemes.length > 0 ? (
                <div
                  className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
                  onMouseLeave={() => setPreviewCustomThemeId(null)}
                >
                  {customThemes.map((customTheme) => {
                    const isSelected =
                      activeThemeSelection.kind === 'custom' &&
                      activeThemeSelection.customThemeId === customTheme.id;
                    const isPreviewing = previewCustomThemeId === customTheme.id;
                    const themePresetId = customTheme.sourcePresetId ?? colorPreset;

                    return (
                      <button
                        key={customTheme.id}
                        type="button"
                        onClick={() => setActiveCustomTheme(customTheme.id)}
                        onMouseEnter={() => setPreviewCustomThemeId(customTheme.id)}
                        onFocus={() => setPreviewCustomThemeId(customTheme.id)}
                        className="rounded-[1.3rem] border border-border/70 bg-background/35 p-4 text-left transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold tracking-[-0.01em]">
                              {customTheme.name}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {isSelected ? (
                                <AppearanceSelectionBadge tone="current">
                                  {t('Current')}
                                </AppearanceSelectionBadge>
                              ) : null}
                              {isPreviewing ? (
                                <AppearanceSelectionBadge tone="preview">
                                  {t('Preview')}
                                </AppearanceSelectionBadge>
                              ) : null}
                              <AppearanceSelectionBadge tone="muted">
                                {customTheme.sourceType === 'blank' ? 'Blank' : 'From preset'}
                              </AppearanceSelectionBadge>
                            </div>
                          </div>
                        </div>

                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {customTheme.sourceType === 'blank'
                            ? 'Editable theme created from a neutral light and dark baseline.'
                            : describeCustomTheme(customTheme, themePresetId)}
                        </p>

                        <ColorPresetMiniCard
                          presetId={themePresetId}
                          mode={colorPreviewMode}
                          accentColor={previewAccentColor}
                          customTheme={customTheme}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/25 px-4 py-5 text-sm text-muted-foreground">
                  No custom themes yet. Start from a preset or create a blank theme document.
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-[1.35rem] border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-medium">Theme editor</h3>
                  <p className="text-sm text-muted-foreground">
                    {tokenEditorTheme
                      ? 'Edit the full token set for the active custom theme.'
                      : 'Select a custom theme to edit, or duplicate a preset first.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={tokenEditorMode === 'light' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTokenEditorMode('light')}
                  >
                    {t('Light')}
                  </Button>
                  <Button
                    variant={tokenEditorMode === 'dark' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTokenEditorMode('dark')}
                  >
                    {t('Dark')}
                  </Button>
                </div>
              </div>

              {tokenEditorTheme ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border border-border/70 bg-background/35 px-3 py-3">
                    <div className="min-w-[16rem] flex-1">
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Name
                      </p>
                      <Input
                        value={tokenEditorTheme.name}
                        onChange={(event) =>
                          renameCustomTheme(tokenEditorTheme.id, event.target.value)
                        }
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AppearanceSelectionBadge tone="muted">
                        {tokenEditorTheme.sourceType === 'blank'
                          ? 'Blank base'
                          : `Based on ${getColorPresetOption(tokenEditorTheme.sourcePresetId ?? colorPreset).label}`}
                      </AppearanceSelectionBadge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteCustomTheme(tokenEditorTheme.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {APP_THEME_TOKEN_GROUPS.map((group) => (
                    <div
                      key={group.id}
                      className="space-y-3 rounded-[1.15rem] border border-border/60 bg-background/20 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{group.label}</p>
                        <AppearanceSelectionBadge tone="muted">
                          {group.keys.length} tokens
                        </AppearanceSelectionBadge>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {group.keys.map((tokenKey) => {
                          const value = tokenEditorTheme.tokens[tokenEditorMode][tokenKey];

                          return (
                            <ThemeTokenInputCard
                              key={`${group.id}-${tokenKey}`}
                              tokenKey={tokenKey}
                              value={value}
                              onChange={(nextValue) =>
                                updateCustomThemeTokens(tokenEditorTheme.id, tokenEditorMode, {
                                  [tokenKey]: nextValue,
                                })
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/25 px-4 py-5 text-sm text-muted-foreground">
                  Select a custom theme to unlock the full token editor.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="rounded-[1.45rem] border border-border/70 p-4 md:p-5"
        style={{
          background: buildPreviewSurfaceBackground({
            highlightColor: 'var(--foreground)',
            highlightAmount: 2,
            highlightStop: '16%',
            surfaceColor: 'var(--card)',
            surfaceAmount: 82,
            baseColor: 'var(--background)',
            baseAmount: 78,
          }),
          boxShadow: `${buildPreviewInsetHighlight('var(--foreground)', 3)}, ${buildPreviewAmbientShadow('var(--muted)', 46, '0 16px 32px')}`,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold tracking-[-0.015em]">
                {effectivePreviewCustomTheme?.name ?? previewedPreset.label}
              </p>
              <AppearanceSelectionBadge tone={livePreviewActive ? 'preview' : 'current'}>
                {livePreviewActive ? t('Preview') : t('Current')}
              </AppearanceSelectionBadge>
              <AppearanceSelectionBadge tone="muted">{previewModeLabel}</AppearanceSelectionBadge>
              {effectivePreviewCustomTheme ? (
                <AppearanceSelectionBadge tone="muted">Custom</AppearanceSelectionBadge>
              ) : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {effectivePreviewDescription}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[15rem]">
            {[
              {
                label: 'Theme',
                color:
                  effectivePreviewCustomTheme?.tokens[colorPreviewMode].primary ??
                  previewedPreset.themeHex,
              },
              {
                label: 'Accent',
                color:
                  effectivePreviewCustomTheme?.tokens[colorPreviewMode].accent ??
                  previewAccentColor,
              },
              {
                label: 'Support',
                color:
                  effectivePreviewCustomTheme?.tokens[colorPreviewMode].support ??
                  previewedPreset.supportHex,
              },
            ].map((entry) => (
              <div
                key={`${entry.label}-${entry.color}`}
                className="rounded-[0.95rem] border border-border/70 bg-background/55 px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full border"
                    style={{
                      backgroundColor: entry.color,
                      borderColor: fadePreviewColor('var(--foreground)', 10),
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
          <ColorPresetPreview
            presetId={previewedPreset.id}
            mode={colorPreviewMode}
            accentColor={previewAccentColor}
            customTheme={effectivePreviewCustomTheme}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{t('Editor sample')}</p>
              <span className="text-xs text-muted-foreground">{t('Live code preview')}</span>
            </div>
            <EditorSamplePreview
              theme={effectivePreviewTheme}
              terminalTheme={terminalTheme}
              colorPreset={previewedPreset.id}
              accentColor={previewAccentColor}
              customTheme={effectivePreviewCustomTheme}
              fontSize={editorSettings.fontSize}
              fontFamily={editorSettings.fontFamily}
              lineHeight={editorSettings.lineHeight}
            />
          </div>
        </div>
      </div>

      {/* Beta Features Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Beta Features')}</h3>
        <p className="text-sm text-muted-foreground">{t('Experimental features')}</p>
      </div>

      {/* Glow Effect Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-muted/35">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{t('Glow Effect')}</p>
            <p className="text-xs text-muted-foreground">
              {t('Animated glow border for AI output states')}
            </p>
          </div>
        </div>
        <Switch checked={glowEffectEnabled} onCheckedChange={setGlowEffectEnabled} />
      </div>

      {/* Background Image Settings */}
      <Collapsible open={bgSettingsOpen} onOpenChange={setBgSettingsOpen} className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-muted/35">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">{t('Background Image')}</p>
              <p className="text-xs text-muted-foreground">
                {t('Custom background image for the workspace')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Switch checked={backgroundImageEnabled} onCheckedChange={setBackgroundImageEnabled} />
            <CollapsibleTrigger
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors',
                'hover:bg-accent/40 hover:text-foreground'
              )}
            >
              <ChevronDown
                className={cn(
                  'h-4 w-4 transition-transform duration-200',
                  bgSettingsOpen ? 'rotate-180' : ''
                )}
              />
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent className="space-y-4 pl-12">
          {/* Source Type */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('Source Type')}</label>
            <Select
              value={backgroundSourceType}
              onValueChange={(v) => setBackgroundSourceType(v as 'file' | 'folder' | 'url')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="file">{t('Image / Video File')}</SelectItem>
                <SelectItem value="folder">{t('Folder (Random)')}</SelectItem>
                <SelectItem value="url">{t('URL (Auto Refresh)')}</SelectItem>
              </SelectPopup>
            </Select>
          </div>

          {/* Source Path */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('Source Path')}</label>
            <div className="flex gap-2">
              <Input
                value={activePath}
                onChange={(e) => setActivePath(e.target.value)}
                placeholder={
                  backgroundSourceType === 'folder'
                    ? t('Select a folder containing images or videos')
                    : backgroundSourceType === 'url'
                      ? t('Paste remote image URL (http/https)')
                      : t('Local file path or URL')
                }
                className="flex-1"
              />
              <Button
                variant="outline"
                disabled={backgroundSourceType === 'url'}
                onClick={backgroundSourceType === 'folder' ? handleSelectFolder : handleSelectFile}
              >
                {backgroundSourceType === 'folder' ? (
                  <>
                    <FolderOpen className="h-4 w-4 mr-1.5" />
                    {t('Select Folder')}
                  </>
                ) : backgroundSourceType === 'url' ? (
                  t('URL Mode')
                ) : (
                  t('Select File')
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={dispatchBackgroundRefresh}
                title={t('Refresh')}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Auto Random - available when source type is folder or URL */}
          {(() => {
            const canAutoRandom =
              backgroundSourceType === 'folder' || backgroundSourceType === 'url';
            return (
              <Collapsible className="space-y-3">
                <CollapsibleTrigger
                  disabled={!canAutoRandom}
                  className={cn(
                    'flex items-center gap-1 text-sm transition-colors',
                    canAutoRandom
                      ? 'text-muted-foreground hover:text-foreground cursor-pointer'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                  )}
                >
                  <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                  {t('Auto Random')}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pl-5">
                  {/* Enable toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm">{t('Enable')}</label>
                    <Switch
                      checked={backgroundRandomEnabled}
                      onCheckedChange={setBackgroundRandomEnabled}
                    />
                  </div>

                  {/* Interval */}
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-sm shrink-0">{t('Interval (seconds)')}</label>
                    <Input
                      type="number"
                      min={5}
                      max={86400}
                      value={backgroundRandomInterval}
                      onChange={(e) => setBackgroundRandomInterval(Number(e.target.value))}
                      className="w-24"
                    />
                  </div>

                  {/* Source Directory */}
                  {backgroundSourceType === 'folder' && (
                    <div className="space-y-1.5">
                      <label className="text-sm">{t('Source Directory')}</label>
                      <div className="flex gap-2">
                        <Input
                          value={backgroundFolderPath}
                          onChange={(e) => setBackgroundFolderPath(e.target.value)}
                          placeholder={t('Select a folder')}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={handleSelectFolder}
                        >
                          <FolderOpen className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Manual Refresh */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={dispatchBackgroundRefresh}
                    className="w-full"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    {t('Refresh')}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            );
          })()}

          {/* Opacity */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">{t('Opacity')}</label>
              <span className="text-sm text-muted-foreground">
                {Math.round(backgroundOpacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(backgroundOpacity * 100)}
              onChange={(e) => setBackgroundOpacity(Number(e.target.value) / 100)}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-input accent-primary"
            />
          </div>

          {/* Blur */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium">{t('Blur')}</label>
              <span className="text-sm text-muted-foreground">{backgroundBlur}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={backgroundBlur}
              onChange={(e) => setBackgroundBlur(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer bg-input accent-primary"
            />
          </div>

          {/* More - Brightness & Saturation */}
          <Collapsible className="space-y-3">
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              {t('More Options')}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4">
              {/* Brightness */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">{t('Brightness')}</label>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(backgroundBrightness * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(backgroundBrightness * 100)}
                  onChange={(e) => setBackgroundBrightness(Number(e.target.value) / 100)}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer bg-input accent-primary"
                />
              </div>

              {/* Saturation */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-sm font-medium">{t('Saturation')}</label>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(backgroundSaturation * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(backgroundSaturation * 100)}
                  onChange={(e) => setBackgroundSaturation(Number(e.target.value) / 100)}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer bg-input accent-primary"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Size Mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('Size Mode')}</label>
            <Select
              value={backgroundSizeMode}
              onValueChange={(v) =>
                setBackgroundSizeMode(v as 'cover' | 'contain' | 'repeat' | 'center')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="contain">Contain</SelectItem>
                <SelectItem value="repeat">Repeat</SelectItem>
                <SelectItem value="center">Center</SelectItem>
              </SelectPopup>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Terminal Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Terminal')}</h3>
        <p className="text-sm text-muted-foreground">{t('Terminal appearance')}</p>
      </div>

      {/* Preview */}
      <div className="space-y-2">
        <p className="text-sm font-medium">{t('Preview')}</p>
        <TerminalPreview
          theme={terminalPreviewTheme}
          fontSize={localFontSize}
          fontFamily={localFontFamily}
          fontWeight={terminalFontWeight}
        />
      </div>

      {/* Theme Selector */}
      <div className="settings-field-row">
        <span className="text-sm font-medium">{t('Color scheme')}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevTheme}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <ThemeCombobox
              value={terminalTheme}
              onValueChange={handleThemeChange}
              themes={displayThemes}
              favoriteThemes={favoriteTerminalThemes}
              onToggleFavorite={toggleFavoriteTerminalTheme}
              onThemeHover={setTerminalTheme}
              showFavoritesOnly={showFavoritesOnly}
              onShowFavoritesOnlyChange={setShowFavoritesOnly}
              showEmptyFavoritesHint={showEmptyFavoritesHint}
            />
          </div>
          <Button variant="outline" size="icon" onClick={handleNextTheme}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Font Family */}
      <div className="settings-field-row">
        <span className="text-sm font-medium">{t('Font')}</span>
        <Input
          value={localFontFamily}
          onChange={(e) => setLocalFontFamily(e.target.value)}
          onBlur={applyFontFamilyChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyFontFamilyChange();
              e.currentTarget.blur();
            }
          }}
          placeholder="JetBrains Mono, monospace"
        />
      </div>

      {/* Font Size */}
      <div className="settings-field-row">
        <span className="text-sm font-medium">{t('Font size')}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={localFontSize}
            onChange={(e) => setLocalFontSize(Number(e.target.value))}
            onBlur={applyFontSizeChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyFontSizeChange();
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

      {/* Font Weight */}
      <div className="settings-field-row">
        <span className="text-sm font-medium">{t('Font weight')}</span>
        <Select
          value={terminalFontWeight}
          onValueChange={(v) => setTerminalFontWeight(v as FontWeight)}
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

      {/* Font Weight Bold */}
      <div className="settings-field-row">
        <span className="text-sm font-medium">{t('Bold font weight')}</span>
        <Select
          value={terminalFontWeightBold}
          onValueChange={(v) => setTerminalFontWeightBold(v as FontWeight)}
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
    </div>
  );
}
