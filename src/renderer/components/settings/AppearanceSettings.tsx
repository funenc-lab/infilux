import {
  ChevronDown,
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
  type Theme,
  useSettingsStore,
} from '@/stores/settings';
import { AppearancePreviewPanel } from './AppearancePreviewPanel';
import { AppearanceTerminalSettingsSection } from './AppearanceTerminalSettingsSection';
import { AppearanceThemeEditorView } from './AppearanceThemeEditorView';
import { buildAppearanceColorPresetModel } from './appearanceColorPresetModel';
import { buildAppearanceThemeModel } from './appearanceThemeModel';
import { filterTerminalThemeNames, localizeTerminalThemeName } from './terminalThemeLocalization';

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
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase',
        tone === 'current'
          ? 'border-primary/24 bg-primary/12 text-foreground'
          : tone === 'preview'
            ? 'border-border/70 bg-background/80 text-foreground'
            : 'border-border/70 bg-muted/50 text-muted-foreground'
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
  return `linear-gradient(180deg, ${fadePreviewColor(highlightColor, Math.max(1, Math.round(highlightAmount * 0.45)))} 0%, transparent ${highlightStop}), linear-gradient(180deg, ${mixPreviewColor(surfaceColor, surfaceAmount, baseColor)} 0%, ${mixPreviewColor(baseColor, baseAmount, surfaceColor)} 100%)`;
}

function buildPreviewInsetHighlight(color: string, amount: number): string {
  return `inset 0 1px 0 ${fadePreviewColor(color, amount)}`;
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
  onSelect,
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
  onSelect: () => void;
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
      className="group relative overflow-hidden rounded-xl border p-4 text-left transition-colors duration-200"
      style={{
        borderColor: isSelected
          ? palette['--ring']
          : 'color-mix(in oklab, var(--border) 88%, transparent)',
        background: buildPreviewSurfaceBackground({
          highlightColor: palette['--primary'],
          highlightAmount: 4,
          highlightStop: '18%',
          surfaceColor: palette['--card'],
          surfaceAmount: 90,
          baseColor: palette['--background'],
          baseAmount: 82,
        }),
        boxShadow: isSelected
          ? `${buildPreviewInsetHighlight(palette['--foreground'], 6)}, 0 0 0 1px ${fadePreviewColor(palette['--primary'], 18)}`
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border"
          style={{
            backgroundColor: mixPreviewColor(palette['--accent'], 66, palette['--background']),
            borderColor: mixPreviewColor(palette['--border'], 75, palette['--background']),
            color: palette['--foreground'],
          }}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex items-center gap-1.5">
          {isSelected ? (
            <AppearanceSelectionBadge tone="current">{t('Current')}</AppearanceSelectionBadge>
          ) : null}
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <p className="text-sm font-medium" style={{ color: palette['--foreground'] }}>
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
      className="mt-3 overflow-hidden rounded-lg border"
      style={{
        background: `linear-gradient(180deg, color-mix(in oklab, ${palette['--foreground']} 3%, transparent) 0%, transparent 30%), ${palette['--background']}`,
        borderColor: palette['--border'],
        boxShadow: `inset 0 1px 0 color-mix(in oklab, ${palette['--foreground']} 6%, transparent)`,
      }}
    >
      <div
        className="h-1"
        style={{
          backgroundColor: mixPreviewColor(palette['--primary'], 64, palette['--support']),
        }}
      />
      <div className="grid grid-cols-[0.92fr_1.08fr] gap-2 p-2.5">
        <div
          className="rounded-md border p-2"
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
          className="rounded-md border p-2"
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
      className="relative overflow-hidden rounded-lg border"
      style={{
        backgroundColor: background,
        borderColor: border,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-8 opacity-45"
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
              boxShadow: `inset 0 1px 0 ${withAlpha(foreground, '08')}`,
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
  const previewFontFamily = fontFamily.trim()
    ? fontFamily
    : 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  type EditorSampleSegment = {
    text: string;
    color: string;
    isSelection?: boolean;
  };
  type EditorSampleLine = {
    lineNumber: number;
    minimapWidth: number;
    segments: EditorSampleSegment[];
    isActiveLine?: boolean;
    cursorColumn?: number;
    decoration?: 'inserted' | 'removed';
    marker?: 'warning';
  };
  const gutterBackground = withAlpha(palette.foreground, palette.mode === 'dark' ? '03' : '04');
  const guideColor = withAlpha(palette.indentGuide, palette.mode === 'dark' ? '68' : '5c');
  const selectedSegmentBackground = withAlpha(
    palette.accent,
    palette.mode === 'dark' ? '3b' : '24'
  );
  const insertedMarkerColor = withAlpha(palette.string, palette.mode === 'dark' ? 'b8' : '96');

  const sampleLines: EditorSampleLine[] = [
    {
      lineNumber: 12,
      minimapWidth: 92,
      segments: [
        { text: 'import ', color: palette.keyword },
        { text: '{ ', color: palette.punctuation },
        { text: 'resolveEditorVisualPalette', color: palette.function },
        { text: ' } ', color: palette.punctuation },
        { text: 'from ', color: palette.keyword },
        { text: "'@/components/files/editorThemePalette'", color: palette.string },
        { text: ';', color: palette.punctuation },
      ],
    },
    {
      lineNumber: 13,
      minimapWidth: 0,
      segments: [],
    },
    {
      lineNumber: 14,
      minimapWidth: 74,
      segments: [
        { text: 'export ', color: palette.keyword },
        { text: 'function ', color: palette.keyword },
        { text: 'buildEditorPreview', color: palette.function },
        { text: '(', color: palette.punctuation },
        { text: 'theme', color: palette.variable },
        { text: ': ', color: palette.punctuation },
        { text: 'Theme', color: palette.type },
        { text: ') {', color: palette.punctuation },
      ],
    },
    {
      lineNumber: 15,
      minimapWidth: 58,
      segments: [
        { text: '  // Preview selection, cursor, and layout states', color: palette.comment },
      ],
    },
    {
      lineNumber: 16,
      minimapWidth: 82,
      segments: [
        { text: '  const ', color: palette.keyword },
        { text: 'preview', color: palette.variable },
        { text: ' = ', color: palette.punctuation },
        { text: 'resolveEditorVisualPalette', color: palette.function },
        { text: '(', color: palette.punctuation },
        { text: '{', color: palette.punctuation },
      ],
    },
    {
      lineNumber: 17,
      minimapWidth: 64,
      segments: [
        { text: '    ', color: palette.punctuation },
        { text: 'theme', color: palette.variable },
        { text: ', ', color: palette.punctuation },
        { text: 'selection', color: palette.variable },
        { text: ': ', color: palette.punctuation },
        { text: "'active'", color: palette.string, isSelection: true },
        { text: ',', color: palette.punctuation },
      ],
    },
    {
      lineNumber: 18,
      minimapWidth: 63,
      decoration: 'inserted',
      marker: 'warning',
      segments: [
        { text: '    ', color: palette.punctuation },
        { text: 'scale', color: palette.variable },
        { text: ': ', color: palette.punctuation },
        { text: '1.125', color: palette.number },
        { text: ', ', color: palette.punctuation },
        { text: 'stickyHeader', color: palette.variable },
        { text: ': ', color: palette.punctuation },
        { text: 'false', color: palette.constant },
        { text: ',', color: palette.punctuation },
      ],
    },
    {
      lineNumber: 19,
      minimapWidth: 80,
      isActiveLine: true,
      cursorColumn: 35,
      segments: [
        { text: '    ', color: palette.punctuation },
        { text: 'markers', color: palette.variable },
        { text: ': ', color: palette.punctuation },
        { text: '[', color: palette.punctuation },
        { text: "'cursor'", color: palette.string },
        { text: ', ', color: palette.punctuation },
        { text: "'selection'", color: palette.string, isSelection: true },
        { text: ', ', color: palette.punctuation },
        { text: "'gutter'", color: palette.string },
        { text: '],', color: palette.punctuation },
      ],
    },
    {
      lineNumber: 20,
      minimapWidth: 54,
      decoration: 'removed',
      segments: [
        { text: '    ', color: palette.punctuation },
        { text: 'stickyHeader', color: palette.variable },
        { text: ': ', color: palette.punctuation },
        { text: 'true', color: palette.constant },
        { text: ',', color: palette.punctuation },
      ],
    },
    {
      lineNumber: 21,
      minimapWidth: 38,
      segments: [{ text: '  });', color: palette.punctuation }],
    },
    {
      lineNumber: 22,
      minimapWidth: 0,
      segments: [],
    },
    {
      lineNumber: 23,
      minimapWidth: 68,
      segments: [
        { text: '  return ', color: palette.keyword },
        { text: 'preview', color: palette.variable },
        { text: '.surface ', color: palette.punctuation },
        { text: '?? ', color: palette.keyword },
        { text: "'editor'", color: palette.string, isSelection: true },
        { text: ';', color: palette.punctuation },
      ],
    },
    {
      lineNumber: 24,
      minimapWidth: 16,
      segments: [{ text: '}', color: palette.punctuation }],
    },
  ];
  const minimapRows = sampleLines.map((line) => ({
    width: line.minimapWidth,
    color: line.isActiveLine
      ? palette.accent
      : line.decoration === 'inserted'
        ? insertedMarkerColor
        : line.decoration === 'removed'
          ? withAlpha(palette.number, palette.mode === 'dark' ? '90' : '80')
          : line.segments[0]?.color === palette.comment
            ? withAlpha(palette.comment, '88')
            : withAlpha(line.segments[0]?.color ?? palette.foreground, '52'),
  }));
  const overviewMarkers = [
    { top: '16%', height: '14%', color: palette.diffInsertedText },
    { top: '49%', height: '18%', color: palette.selectionBackground },
    { top: '71%', height: '12%', color: palette.diffRemovedText },
  ];

  return (
    <div
      className="overflow-hidden rounded-lg border"
      style={{
        backgroundColor: palette.background,
        borderColor: palette.indentGuide,
        boxShadow: `inset 0 1px 0 ${withAlpha(palette.foreground, '08')}`,
        color: palette.foreground,
      }}
    >
      <div
        className="flex items-center justify-between gap-4 border-b px-3 py-2"
        style={{
          backgroundColor: withAlpha(palette.foreground, palette.mode === 'dark' ? '04' : '03'),
          borderColor: palette.indentGuide,
        }}
      >
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium" style={{ color: palette.foreground }}>
            src/renderer/theme/preview.ts
          </p>
          <p className="truncate text-[10px]" style={{ color: palette.lineNumber }}>
            Selection, cursor, and active line states
          </p>
        </div>
        <span
          className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em]"
          style={{ color: palette.lineNumber }}
        >
          TypeScript
        </span>
      </div>

      <div
        className="grid grid-cols-[minmax(0,1fr)_2.75rem]"
        style={{
          fontFamily: previewFontFamily,
          fontSize: `${fontSize}px`,
          lineHeight,
        }}
      >
        <div
          className="min-h-[14rem] py-2"
          style={{
            backgroundImage: `linear-gradient(90deg, ${gutterBackground} 0, ${gutterBackground} 3.4rem, transparent 3.4rem), repeating-linear-gradient(90deg, transparent 0, transparent 2.2ch, ${guideColor} 2.2ch, transparent 2.3ch)`,
          }}
        >
          {sampleLines.map((line) => (
            <div
              key={`editor-sample-line-${line.lineNumber}`}
              className="grid grid-cols-[0.375rem_3rem_minmax(0,1fr)] items-start px-3"
              style={{
                backgroundColor: line.isActiveLine
                  ? palette.lineHighlight
                  : line.decoration === 'inserted'
                    ? palette.diffInsertedLine
                    : line.decoration === 'removed'
                      ? palette.diffRemovedLine
                      : 'transparent',
                borderLeft: line.isActiveLine
                  ? `2px solid ${palette.accent}`
                  : '2px solid transparent',
              }}
            >
              <div className="flex justify-center pt-1.5">
                {line.isActiveLine ? (
                  <span
                    className="h-4 w-0.5 rounded-full"
                    style={{ backgroundColor: palette.accent }}
                  />
                ) : line.decoration === 'inserted' ? (
                  <span
                    className="h-4 w-0.5 rounded-full"
                    style={{ backgroundColor: insertedMarkerColor }}
                  />
                ) : line.decoration === 'removed' ? (
                  <span
                    className="h-4 w-0.5 rounded-full"
                    style={{ backgroundColor: palette.number }}
                  />
                ) : null}
              </div>
              <div
                className="flex select-none items-start justify-end gap-1 pr-3 pt-0.5 text-right text-[0.82em]"
                style={{ color: line.isActiveLine ? palette.foreground : palette.lineNumber }}
              >
                {line.marker === 'warning' ? (
                  <span
                    className="mt-[0.2rem] h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: palette.number }}
                  />
                ) : null}
                {line.lineNumber}
              </div>
              <div className="relative min-w-0 overflow-hidden py-0.5 whitespace-pre">
                {line.segments.map((segment, segmentIndex) => (
                  <span
                    key={`editor-sample-segment-${line.lineNumber}-${segmentIndex + 1}`}
                    style={{
                      color: segment.isSelection ? palette.foreground : segment.color,
                      backgroundColor: segment.isSelection
                        ? selectedSegmentBackground
                        : 'transparent',
                      borderRadius: segment.isSelection ? '0.22rem' : undefined,
                      paddingInline: segment.isSelection ? '0.08rem' : undefined,
                    }}
                  >
                    {segment.text}
                  </span>
                ))}
                {line.cursorColumn ? (
                  <span
                    className="pointer-events-none absolute w-px rounded-full"
                    style={{
                      left: `calc(${line.cursorColumn}ch + 0.125rem)`,
                      top: '0.2em',
                      bottom: '0.2em',
                      backgroundColor: palette.accent,
                      boxShadow: `0 0 0 1px ${withAlpha(palette.background, '66')}`,
                    }}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div
          className="relative flex flex-col gap-1.5 border-l px-2 py-2"
          style={{
            backgroundColor: withAlpha(palette.foreground, palette.mode === 'dark' ? '03' : '04'),
            borderColor: palette.indentGuide,
          }}
        >
          {minimapRows.map((row, index) => (
            <span
              key={`editor-sample-minimap-${index + 1}`}
              className="h-1 rounded-full"
              style={{
                width: `${Math.max(10, row.width)}%`,
                backgroundColor: row.width === 0 ? 'transparent' : row.color,
                opacity: row.width === 0 ? 0 : 1,
              }}
            />
          ))}
          <span
            className="mt-1 h-2 w-full rounded-full"
            style={{ backgroundColor: palette.diffInsertedText }}
          />
          <span
            className="mt-auto h-8 rounded-sm"
            style={{ backgroundColor: palette.selectionBackground }}
          />
          <div className="pointer-events-none absolute inset-y-2 right-1.5 w-0.5">
            {overviewMarkers.map((marker, index) => (
              <span
                key={`editor-sample-overview-${index + 1}`}
                className="absolute inset-x-0 rounded-full"
                style={{
                  top: marker.top,
                  height: marker.height,
                  backgroundColor: marker.color,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function describeCustomTheme(
  customTheme: CustomThemeDocument,
  fallbackPreset: ColorPreset,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (customTheme.sourceType === 'blank') {
    return t('Custom theme built from a blank starting point.');
  }

  return t('Custom theme derived from {{name}}.', {
    name: t(getColorPresetOption(customTheme.sourcePresetId ?? fallbackPreset).label),
  });
}

function ThemeTokenInputCard({
  tokenKey,
  value,
  readOnly = false,
  onChange,
}: {
  tokenKey: string;
  value: string;
  readOnly?: boolean;
  onChange: (nextValue: string) => void;
}) {
  const { t } = useI18n();

  return (
    <div
      className="rounded-lg border border-border/70 bg-background/40 p-3"
      style={{
        background: 'color-mix(in oklab, var(--background) 92%, var(--muted) 8%)',
        boxShadow: buildPreviewInsetHighlight('var(--foreground)', 2),
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
          className="h-11 w-11 shrink-0 rounded-lg border"
          style={{
            backgroundColor: value,
            borderColor: fadePreviewColor('var(--foreground)', 10),
            boxShadow: buildPreviewInsetHighlight('var(--foreground)', 18),
          }}
        />
      </div>

      <div className="mt-3">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          readOnly={readOnly}
          disabled={readOnly}
        />
        {readOnly ? (
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            {t('Runtime semantic colors stay locked to the selected theme family.')}
          </p>
        ) : null}
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
      className={cn(
        'p-1 text-muted-foreground transition-colors hover:text-destructive',
        className
      )}
    >
      {isFavorite ? (
        <Heart className="h-4 w-4 fill-current text-destructive" />
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
  showFavoritesOnly,
  onShowFavoritesOnlyChange,
  showEmptyFavoritesHint,
}: {
  value: string;
  onValueChange: (value: string | null) => void;
  themes: string[];
  favoriteThemes: string[];
  onToggleFavorite: (theme: string) => void;
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: (checked: boolean) => void;
  showEmptyFavoritesHint?: boolean;
}) {
  const { t } = useI18n();
  const getThemeLabel = React.useCallback(
    (themeName: string) => localizeTerminalThemeName(themeName, t),
    [t]
  );
  const [internalValue, setInternalValue] = React.useState(value);
  const [search, setSearch] = React.useState(() => getThemeLabel(value));
  const [isOpen, setIsOpen] = React.useState(false);
  const favoriteSet = React.useMemo(() => new Set(favoriteThemes), [favoriteThemes]);

  React.useEffect(() => {
    if (!isOpen) {
      setInternalValue(value);
      setSearch(getThemeLabel(value));
    }
  }, [value, isOpen, getThemeLabel]);

  const filteredThemes = React.useMemo(() => {
    return filterTerminalThemeNames({
      themes,
      query: search,
      selectedTheme: internalValue,
      t,
    });
  }, [themes, search, internalValue, t]);

  const handleValueChange = (newValue: string | null) => {
    if (newValue) {
      setInternalValue(newValue);
      setSearch(getThemeLabel(newValue));
    }
    onValueChange(newValue);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setInternalValue(value);
      setSearch(getThemeLabel(value));
    }
  };

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
        <ComboboxList>
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
              {getThemeLabel(name)}
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
    fontSize: appFontSize,
    setFontSize: setAppFontSize,
    fontFamily: appFontFamily,
    setFontFamily: setAppFontFamily,
    terminalTheme,
    setTerminalTheme,
    terminalFontSize,
    setTerminalFontSize,
    terminalFontFamily,
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
  const [tokenEditorMode, setTokenEditorMode] = React.useState<ResolvedThemeMode>('dark');
  const [editingCustomThemeId, setEditingCustomThemeId] = React.useState<string | null>(null);
  const themeModel = React.useMemo(() => buildAppearanceThemeModel({ theme, t }), [theme, t]);
  const activeCustomTheme = React.useMemo(
    () => findCustomThemeBySelection(customThemes, activeThemeSelection),
    [activeThemeSelection, customThemes]
  );
  const editingCustomTheme = React.useMemo(
    () => customThemes.find((candidate) => candidate.id === editingCustomThemeId) ?? null,
    [customThemes, editingCustomThemeId]
  );
  const activeAppearanceMode = React.useMemo(
    () => resolveAppearancePreviewMode(theme, terminalTheme),
    [terminalTheme, theme]
  );
  const themeModeIcons: Record<Exclude<Theme, 'sync-terminal'>, React.ElementType> = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  // Local state for inputs
  const [localAppFontSize, setLocalAppFontSize] = React.useState(appFontSize);
  const [localAppFontFamily, setLocalAppFontFamily] = React.useState(appFontFamily);
  const [localTerminalFontSize, setLocalTerminalFontSize] = React.useState(terminalFontSize);
  const [localTerminalFontFamily, setLocalTerminalFontFamily] = React.useState(terminalFontFamily);
  const [showFavoritesOnly, setShowFavoritesOnly] = React.useState(false);
  const [bgSettingsOpen, setBgSettingsOpen] = React.useState(false);

  // Sync local state with global when global changes externally
  React.useEffect(() => {
    setLocalAppFontSize(appFontSize);
  }, [appFontSize]);

  React.useEffect(() => {
    setLocalAppFontFamily(appFontFamily);
  }, [appFontFamily]);

  React.useEffect(() => {
    setLocalTerminalFontSize(terminalFontSize);
  }, [terminalFontSize]);

  React.useEffect(() => {
    setLocalTerminalFontFamily(terminalFontFamily);
  }, [terminalFontFamily]);

  React.useEffect(() => {
    if (editingCustomThemeId && !editingCustomTheme) {
      setEditingCustomThemeId(null);
    }
  }, [editingCustomTheme, editingCustomThemeId]);

  const applyAppFontSizeChange = React.useCallback(() => {
    const validFontSize = Math.max(12, Math.min(20, localAppFontSize || 14));
    if (validFontSize !== localAppFontSize) {
      setLocalAppFontSize(validFontSize);
    }
    if (validFontSize !== appFontSize) {
      setAppFontSize(validFontSize);
    }
  }, [localAppFontSize, appFontSize, setAppFontSize]);

  const applyAppFontFamilyChange = React.useCallback(() => {
    const validFontFamily = localAppFontFamily.trim() || appFontFamily;
    if (validFontFamily !== localAppFontFamily) {
      setLocalAppFontFamily(validFontFamily);
    }
    if (validFontFamily !== appFontFamily) {
      setAppFontFamily(validFontFamily);
    }
  }, [localAppFontFamily, appFontFamily, setAppFontFamily]);

  const applyTerminalFontSizeChange = React.useCallback(() => {
    const validFontSize = Math.max(8, Math.min(32, localTerminalFontSize || 8));
    if (validFontSize !== localTerminalFontSize) {
      setLocalTerminalFontSize(validFontSize);
    }
    if (validFontSize !== terminalFontSize) {
      setTerminalFontSize(validFontSize);
    }
  }, [localTerminalFontSize, setTerminalFontSize, terminalFontSize]);

  const applyTerminalFontFamilyChange = React.useCallback(() => {
    const validFontFamily = localTerminalFontFamily.trim() || terminalFontFamily;
    if (validFontFamily !== localTerminalFontFamily) {
      setLocalTerminalFontFamily(validFontFamily);
    }
    if (validFontFamily !== terminalFontFamily) {
      setTerminalFontFamily(validFontFamily);
    }
  }, [localTerminalFontFamily, setTerminalFontFamily, terminalFontFamily]);

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
  const activePresetId = activeCustomTheme?.sourcePresetId ?? colorPreset;
  const colorPresetModel = React.useMemo(
    () =>
      buildAppearanceColorPresetModel({
        selectedPresetId: colorPreset,
        presetOptions: APP_COLOR_PRESET_OPTIONS,
        t,
      }),
    [colorPreset, t]
  );
  const selectedPreset = colorPresetModel.selectedPreset;
  const colorInputValue = customAccentColor || selectedPreset.themeHex;
  const presetCardAccentColor = React.useMemo(
    () => resolveAppearanceAccentColor(theme, terminalTheme, customAccentColor),
    [customAccentColor, terminalTheme, theme]
  );
  const activeAccentColor = React.useMemo(() => {
    if (activeCustomTheme) {
      return activeCustomTheme.tokens[activeAppearanceMode].primary;
    }

    return resolveAppearanceAccentColor(theme, terminalTheme, customAccentColor);
  }, [activeAppearanceMode, activeCustomTheme, customAccentColor, terminalTheme, theme]);
  const activePreset = React.useMemo(
    () => getColorPresetOption(activePresetId) ?? selectedPreset,
    [activePresetId, selectedPreset]
  );
  const activeModeLabel = React.useMemo(() => {
    if (theme === 'sync-terminal') {
      return t('Sync terminal theme');
    }

    return themeModel.modeOptions.find((option) => option.value === theme)?.label ?? t('System');
  }, [t, theme, themeModel.modeOptions]);

  React.useEffect(() => {
    applyAppearancePreview({
      theme,
      terminalTheme,
      colorPreset: activePresetId,
      accentColor: activeAccentColor,
      customTheme: activeCustomTheme,
    });

    return () => {
      applyAppearancePreview({
        theme,
        terminalTheme,
        colorPreset: activePresetId,
        accentColor: activeAccentColor,
        customTheme: activeCustomTheme,
      });
    };
  }, [activeCustomTheme, activeAccentColor, activePresetId, terminalTheme, theme]);

  // Get preview theme synchronously
  const terminalPreviewTheme = React.useMemo(() => {
    return getXtermTheme(terminalTheme) ?? defaultDarkTheme;
  }, [terminalTheme]);

  const handleThemeChange = (value: string | null) => {
    if (value) {
      setTerminalTheme(value);
    }
  };

  const handleOpenCustomThemeEditor = React.useCallback(
    (themeId: string) => {
      setActiveCustomTheme(themeId);
      setEditingCustomThemeId(themeId);
    },
    [setActiveCustomTheme]
  );

  const handleCreateThemeFromPreset = React.useCallback(() => {
    const nextThemeId = createCustomThemeFromPreset(colorPreset);
    setEditingCustomThemeId(nextThemeId);
  }, [colorPreset, createCustomThemeFromPreset]);

  const handleCreateBlankTheme = React.useCallback(() => {
    const nextThemeId = createBlankCustomTheme();
    setEditingCustomThemeId(nextThemeId);
  }, [createBlankCustomTheme]);

  const handleDeleteEditingTheme = React.useCallback(() => {
    if (!editingCustomTheme) {
      return;
    }

    setEditingCustomThemeId(null);
    deleteCustomTheme(editingCustomTheme.id);
  }, [deleteCustomTheme, editingCustomTheme]);

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
  const activeAppearanceDescription = activeCustomTheme
    ? describeCustomTheme(activeCustomTheme, activeCustomTheme.sourcePresetId ?? colorPreset, t)
    : t(activePreset.description);
  const editorPresetId = editingCustomTheme?.sourcePresetId ?? colorPreset;
  const editorAccentColor =
    editingCustomTheme?.tokens[activeAppearanceMode].primary ?? activeAccentColor;
  const editorAppearanceDescription = editingCustomTheme
    ? describeCustomTheme(editingCustomTheme, editorPresetId, t)
    : '';

  if (editingCustomTheme) {
    return (
      <AppearanceThemeEditorView
        customTheme={editingCustomTheme}
        tokenEditorMode={tokenEditorMode}
        activeModeLabel={activeModeLabel}
        activeAppearanceMode={activeAppearanceMode}
        editorPresetId={editorPresetId}
        editorAppearanceDescription={editorAppearanceDescription}
        editorAccentColor={editorAccentColor}
        theme={theme}
        terminalTheme={terminalTheme}
        editorFontSize={editorSettings.fontSize}
        editorFontFamily={editorSettings.fontFamily}
        editorLineHeight={editorSettings.lineHeight}
        onBack={() => setEditingCustomThemeId(null)}
        onTokenEditorModeChange={setTokenEditorMode}
        onRename={(name) => renameCustomTheme(editingCustomTheme.id, name)}
        onDelete={handleDeleteEditingTheme}
        onUpdateTokens={(mode, updates) =>
          updateCustomThemeTokens(editingCustomTheme.id, mode, updates)
        }
        SelectionBadge={AppearanceSelectionBadge}
        ThemeTokenCard={ThemeTokenInputCard}
        PresetPreview={ColorPresetPreview}
        EditorPreview={EditorSamplePreview}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="control-panel overflow-hidden rounded-xl p-4 md:p-5">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium">{t('Theme mode')}</h3>
              <p className="text-sm text-muted-foreground">{t('Choose interface theme')}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
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
                    colorPreset={activePresetId}
                    customAccentColor={customAccentColor}
                    customTheme={activeCustomTheme}
                    isSelected={themeModel.activeMode === option.value}
                    onSelect={() => setTheme(option.value)}
                  />
                );
              })}
            </div>

            <div className="control-panel-muted overflow-hidden rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.95rem] border border-border/70 bg-background/35">
                    <Terminal className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{t('Sync terminal theme')}</p>
                      {themeModel.terminalSyncEnabled ? (
                        <AppearanceSelectionBadge tone="current">
                          {t('Current')}
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
                  {t('Custom themes manage their own primary, accent, and support tokens.')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium">{t('Color scheme')}</h3>
              <p className="text-sm text-muted-foreground">
                {t('Choose the palette that shapes surfaces, focus states, and brand emphasis.')}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {colorPresetModel.compactOptions.map((option) => {
                const isSelected =
                  activeThemeSelection.kind === 'preset' &&
                  activeThemeSelection.presetId === option.id;
                const optionPalette = resolveThemeVariables({
                  mode: activeAppearanceMode,
                  preset: option.id,
                  customAccentColor: activeAccentColor,
                });

                return (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => setActivePresetTheme(option.id)}
                    className="group relative overflow-hidden rounded-xl border p-4 text-left transition-colors duration-200"
                    style={{
                      borderColor: isSelected
                        ? optionPalette['--ring']
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
                          className="truncate text-sm font-medium"
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
                      mode={activeAppearanceMode}
                      accentColor={presetCardAccentColor}
                    />
                  </button>
                );
              })}
            </div>

            <div className="control-panel-muted space-y-3 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-medium">{t('Custom themes')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('Create blank themes or duplicate a preset into your own theme library.')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleCreateThemeFromPreset}>
                    {t('Copy current preset')}
                  </Button>
                  {activeCustomTheme ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenCustomThemeEditor(activeCustomTheme.id)}
                    >
                      {t('Edit selected')}
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={handleCreateBlankTheme}>
                    {t('New blank')}
                  </Button>
                </div>
              </div>

              {customThemes.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {customThemes.map((customTheme) => {
                    const isSelected =
                      activeThemeSelection.kind === 'custom' &&
                      activeThemeSelection.customThemeId === customTheme.id;
                    const themePresetId = customTheme.sourcePresetId ?? colorPreset;

                    return (
                      <button
                        key={customTheme.id}
                        type="button"
                        onClick={() => setActiveCustomTheme(customTheme.id)}
                        className="rounded-xl border border-border/70 bg-background/35 p-4 text-left transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{customTheme.name}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {isSelected ? (
                                <AppearanceSelectionBadge tone="current">
                                  {t('Current')}
                                </AppearanceSelectionBadge>
                              ) : null}
                              <AppearanceSelectionBadge tone="muted">
                                {customTheme.sourceType === 'blank' ? t('Blank') : t('From preset')}
                              </AppearanceSelectionBadge>
                            </div>
                          </div>
                        </div>

                        <p className="mt-3 text-xs leading-5 text-muted-foreground">
                          {customTheme.sourceType === 'blank'
                            ? t('Editable theme created from a neutral light and dark baseline.')
                            : describeCustomTheme(customTheme, themePresetId, t)}
                        </p>

                        <ColorPresetMiniCard
                          presetId={themePresetId}
                          mode={activeAppearanceMode}
                          accentColor={activeAccentColor}
                          customTheme={customTheme}
                        />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 bg-background/25 px-4 py-5 text-sm text-muted-foreground">
                  {t('No custom themes yet. Start from a preset or create a blank theme document.')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <AppearancePreviewPanel
        title={activeCustomTheme?.name ?? t(activePreset.label)}
        description={activeAppearanceDescription}
        modeLabel={activeModeLabel}
        isCustom={Boolean(activeCustomTheme)}
        themeColor={
          activeCustomTheme?.tokens[activeAppearanceMode].primary ?? activePreset.themeHex
        }
        accentColor={activeCustomTheme?.tokens[activeAppearanceMode].accent ?? activeAccentColor}
        supportColor={
          activeCustomTheme?.tokens[activeAppearanceMode].support ?? activePreset.supportHex
        }
        previewPresetId={activePreset.id}
        previewMode={activeAppearanceMode}
        previewCustomTheme={activeCustomTheme}
        theme={theme}
        terminalTheme={terminalTheme}
        editorFontSize={editorSettings.fontSize}
        editorFontFamily={editorSettings.fontFamily}
        editorLineHeight={editorSettings.lineHeight}
        SelectionBadge={AppearanceSelectionBadge}
        PresetPreview={ColorPresetPreview}
        EditorPreview={EditorSamplePreview}
      />

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
            <p className="text-sm font-medium">{t('State Highlight')}</p>
            <p className="text-xs text-muted-foreground">
              {t('Highlight AI output states with stronger borders')}
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

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium">{t('Interface typography')}</h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'Adjust the app font family and UI base size without changing editor or terminal text.'
          )}
        </p>
      </div>

      <div className="control-panel-muted rounded-xl p-4">
        <div
          className="rounded-[0.95rem] border border-border/70 bg-background/40 px-4 py-4"
          style={{
            fontFamily: localAppFontFamily,
            fontSize: `${localAppFontSize}px`,
          }}
        >
          <p className="text-[0.72em] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t('Interface sample')}
          </p>
          <p className="mt-2 text-[1.2em] font-semibold tracking-[-0.02em] text-foreground">
            {t('Workspace control surface')}
          </p>
          <p className="mt-2 max-w-[56ch] text-[0.94em] leading-[1.55] text-muted-foreground">
            {t(
              'This preview follows the app typography tokens only. Editor and terminal fonts stay independent.'
            )}
          </p>
        </div>
      </div>

      <div className="settings-field-row">
        <span className="text-sm font-medium">{t('UI font')}</span>
        <Input
          value={localAppFontFamily}
          onChange={(e) => setLocalAppFontFamily(e.target.value)}
          onBlur={applyAppFontFamilyChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyAppFontFamilyChange();
              e.currentTarget.blur();
            }
          }}
          placeholder="system-ui, sans-serif"
        />
      </div>

      <div className="settings-field-row">
        <span className="text-sm font-medium">{t('UI font size')}</span>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={localAppFontSize}
            onChange={(e) => setLocalAppFontSize(Number(e.target.value))}
            onBlur={applyAppFontSizeChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                applyAppFontSizeChange();
                e.currentTarget.blur();
              }
            }}
            min={12}
            max={20}
            className="w-20"
          />
          <span className="text-sm text-muted-foreground">px</span>
        </div>
      </div>

      <AppearanceTerminalSettingsSection
        terminalPreviewTheme={terminalPreviewTheme}
        localFontSize={localTerminalFontSize}
        localFontFamily={localTerminalFontFamily}
        terminalFontWeight={terminalFontWeight}
        terminalFontWeightBold={terminalFontWeightBold}
        terminalTheme={terminalTheme}
        displayThemes={displayThemes}
        favoriteTerminalThemes={favoriteTerminalThemes}
        showFavoritesOnly={showFavoritesOnly}
        showEmptyFavoritesHint={showEmptyFavoritesHint}
        onPrevTheme={handlePrevTheme}
        onNextTheme={handleNextTheme}
        onThemeChange={handleThemeChange}
        onToggleFavoriteTheme={toggleFavoriteTerminalTheme}
        onShowFavoritesOnlyChange={setShowFavoritesOnly}
        onFontFamilyChange={setLocalTerminalFontFamily}
        onFontFamilyCommit={applyTerminalFontFamilyChange}
        onFontSizeChange={setLocalTerminalFontSize}
        onFontSizeCommit={applyTerminalFontSizeChange}
        onFontWeightChange={setTerminalFontWeight}
        onFontWeightBoldChange={setTerminalFontWeightBold}
        ThemeSelector={ThemeCombobox}
        TerminalPreview={TerminalPreview}
      />
    </div>
  );
}
