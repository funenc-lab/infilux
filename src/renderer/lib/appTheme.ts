import type {
  ColorPreset,
  CustomThemeDocument,
  ThemeSelection,
  ThemeTokenSet,
} from '@/stores/settings/types';

export type ResolvedThemeMode = 'light' | 'dark';
export type ThemeVariableMap = Record<string, string>;

interface ColorPresetOption {
  id: ColorPreset;
  label: string;
  description: string;
  themeHex: string;
  accentHex: string;
  supportHex: string;
  swatches: [string, string, string];
  featured?: boolean;
  isDefault?: boolean;
}

interface ThemeFoundationConfig {
  background: string;
  foreground: string;
  card: string;
  popover: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  primary: string;
  primaryForeground: string;
  support: string;
  supportForeground: string;
  border: string;
  input?: string;
  ring?: string;
}

interface ThemePresetDefinition {
  option: ColorPresetOption;
  semanticFamily: SemanticPresetFamily;
  palettes: Record<ResolvedThemeMode, ThemeFoundationConfig>;
}

type SemanticPresetFamily = 'signal-console' | 'cool-console' | 'warm-console';

const CUSTOM_ACCENT_PATTERN = /^#(?:[0-9a-fA-F]{6})$/;
const CUSTOM_ACCENT_DARK_FOREGROUND = '#081018';
const CUSTOM_ACCENT_LIGHT_FOREGROUND = '#f5f7fb';

export const APP_THEME_TOKEN_GROUPS = [
  {
    id: 'surfaces',
    label: 'Surfaces',
    keys: ['background', 'card', 'popover', 'secondary', 'muted'] as const,
  },
  {
    id: 'typography',
    label: 'Typography',
    keys: [
      'foreground',
      'mutedForeground',
      'accentForeground',
      'primaryForeground',
      'supportForeground',
    ] as const,
  },
  {
    id: 'brand',
    label: 'Brand',
    keys: ['primary', 'accent', 'support', 'border', 'input', 'ring'] as const,
  },
  {
    id: 'status',
    label: 'Status',
    keys: ['success', 'warning', 'info', 'destructive'] as const,
  },
] as const;

export const APP_THEME_TOKEN_KEYS = APP_THEME_TOKEN_GROUPS.flatMap((group) => [...group.keys]);
export const APP_THEME_PROTECTED_TOKEN_KEYS = [
  'success',
  'warning',
  'info',
  'destructive',
] as const;

const RETIRED_COLOR_PRESET_MAP: Record<string, ColorPreset> = {
  'classic-red': 'warm-graphite',
  'red-graphite-oled': 'midnight-oled',
};

function mixToken(left: string, right: string, leftWeight: string): string {
  const numericLeftWeight = Number.parseInt(leftWeight, 10);
  const safeLeftWeight = Number.isFinite(numericLeftWeight)
    ? Math.min(100, Math.max(0, numericLeftWeight))
    : 50;
  const rightWeight = 100 - safeLeftWeight;

  return `color-mix(in oklch, ${left} ${safeLeftWeight}%, ${right} ${rightWeight}%)`;
}

function createFoundationPalette(config: ThemeFoundationConfig): ThemeVariableMap {
  return {
    '--theme-background-base': config.background,
    '--theme-card-base': config.card,
    '--theme-popover-base': config.popover,
    '--theme-muted-base': config.muted,
    '--theme-border-base': config.border,
    '--theme-input-base': config.input ?? config.border,
    '--background': config.background,
    '--foreground': config.foreground,
    '--card': config.card,
    '--card-foreground': config.foreground,
    '--popover': config.popover,
    '--popover-foreground': config.foreground,
    '--secondary': config.secondary,
    '--secondary-foreground': config.foreground,
    '--muted': config.muted,
    '--muted-foreground': config.mutedForeground,
    '--accent': config.accent,
    '--accent-foreground': config.accentForeground,
    '--primary': config.primary,
    '--primary-foreground': config.primaryForeground,
    '--theme': config.primary,
    '--theme-foreground': config.primaryForeground,
    '--support': config.support,
    '--support-foreground': config.supportForeground,
    '--border': config.border,
    '--input': config.input ?? config.border,
    '--ring': config.ring ?? config.primary,
  };
}

const semanticColorVariables: Record<
  SemanticPresetFamily,
  Record<ResolvedThemeMode, ThemeVariableMap>
> = {
  'signal-console': {
    light: {
      '--destructive': 'oklch(0.59 0.185 24)',
      '--success': 'oklch(0.585 0.13 154)',
      '--warning': 'oklch(0.79 0.145 78)',
      '--warning-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--info': 'oklch(0.645 0.11 236)',
      '--info-foreground': CUSTOM_ACCENT_LIGHT_FOREGROUND,
    },
    dark: {
      '--destructive': 'oklch(0.648 0.148 24)',
      '--destructive-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--success': 'oklch(0.69 0.122 154)',
      '--success-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--warning': 'oklch(0.812 0.13 78)',
      '--warning-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--info': 'oklch(0.742 0.1 236)',
      '--info-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
    },
  },
  'cool-console': {
    light: {
      '--destructive': 'oklch(0.586 0.176 24)',
      '--destructive-foreground': CUSTOM_ACCENT_LIGHT_FOREGROUND,
      '--success': 'oklch(0.565 0.126 154)',
      '--success-foreground': CUSTOM_ACCENT_LIGHT_FOREGROUND,
      '--warning': 'oklch(0.782 0.15 76)',
      '--warning-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--info': 'oklch(0.635 0.122 244)',
      '--info-foreground': CUSTOM_ACCENT_LIGHT_FOREGROUND,
    },
    dark: {
      '--destructive': 'oklch(0.642 0.142 24)',
      '--destructive-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--success': 'oklch(0.678 0.116 154)',
      '--success-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--warning': 'oklch(0.804 0.132 76)',
      '--warning-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--info': 'oklch(0.742 0.1 244)',
      '--info-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
    },
  },
  'warm-console': {
    light: {
      '--destructive': 'oklch(0.594 0.168 28)',
      '--destructive-foreground': CUSTOM_ACCENT_LIGHT_FOREGROUND,
      '--success': 'oklch(0.57 0.118 150)',
      '--success-foreground': CUSTOM_ACCENT_LIGHT_FOREGROUND,
      '--warning': 'oklch(0.788 0.136 80)',
      '--warning-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--info': 'oklch(0.628 0.1 230)',
      '--info-foreground': CUSTOM_ACCENT_LIGHT_FOREGROUND,
    },
    dark: {
      '--destructive': 'oklch(0.656 0.134 28)',
      '--destructive-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--success': 'oklch(0.684 0.11 150)',
      '--success-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--warning': 'oklch(0.808 0.122 80)',
      '--warning-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
      '--info': 'oklch(0.726 0.084 230)',
      '--info-foreground': CUSTOM_ACCENT_DARK_FOREGROUND,
    },
  },
};

function createThemeTokenSet(
  foundation: ThemeFoundationConfig,
  semantic: ThemeVariableMap
): ThemeTokenSet {
  return {
    background: foundation.background,
    foreground: foundation.foreground,
    card: foundation.card,
    popover: foundation.popover,
    secondary: foundation.secondary,
    muted: foundation.muted,
    mutedForeground: foundation.mutedForeground,
    accent: foundation.accent,
    accentForeground: foundation.accentForeground,
    primary: foundation.primary,
    primaryForeground: foundation.primaryForeground,
    support: foundation.support,
    supportForeground: foundation.supportForeground,
    border: foundation.border,
    input: foundation.input ?? foundation.border,
    ring: foundation.ring ?? foundation.primary,
    success: semantic['--success'],
    warning: semantic['--warning'],
    info: semantic['--info'],
    destructive: semantic['--destructive'],
  };
}

function createFoundationFromThemeTokens(tokens: ThemeTokenSet): ThemeFoundationConfig {
  return {
    background: tokens.background,
    foreground: tokens.foreground,
    card: tokens.card,
    popover: tokens.popover,
    secondary: tokens.secondary,
    muted: tokens.muted,
    mutedForeground: tokens.mutedForeground,
    accent: tokens.accent,
    accentForeground: tokens.accentForeground,
    primary: tokens.primary,
    primaryForeground: tokens.primaryForeground,
    support: tokens.support,
    supportForeground: tokens.supportForeground,
    border: tokens.border,
    input: tokens.input,
    ring: tokens.ring,
  };
}

const presetDefinitions: Record<ColorPreset, ThemePresetDefinition> = {
  'graphite-ink': {
    option: {
      id: 'graphite-ink',
      label: 'Graphite Ink',
      description:
        'Default console palette with cool graphite surfaces, steel-blue theme emphasis, and restrained teal support.',
      themeHex: '#7d94c9',
      accentHex: '#34415e',
      supportHex: '#5e8f92',
      swatches: ['#161b24', '#7d94c9', '#5e8f92'],
      featured: true,
      isDefault: true,
    },
    semanticFamily: 'cool-console',
    palettes: {
      light: {
        background: 'oklch(0.978 0.006 250)',
        foreground: 'oklch(0.255 0.016 252)',
        card: 'oklch(0.993 0.003 250)',
        popover: 'oklch(0.996 0.003 250)',
        secondary: 'oklch(0.949 0.009 248)',
        muted: 'oklch(0.957 0.008 248)',
        mutedForeground: 'oklch(0.49 0.014 248)',
        accent: 'oklch(0.922 0.026 244)',
        accentForeground: 'oklch(0.245 0.018 252)',
        primary: 'oklch(0.58 0.078 244)',
        primaryForeground: 'oklch(0.986 0.003 252)',
        support: 'oklch(0.62 0.052 196)',
        supportForeground: 'oklch(0.986 0.003 252)',
        border: 'oklch(0.874 0.012 248)',
        ring: 'oklch(0.654 0.086 244)',
      },
      dark: {
        background: 'oklch(0.165 0.01 248)',
        foreground: 'oklch(0.95 0.006 250)',
        card: 'oklch(0.202 0.012 248)',
        popover: 'oklch(0.214 0.012 248)',
        secondary: 'oklch(0.244 0.013 248)',
        muted: 'oklch(0.232 0.012 248)',
        mutedForeground: 'oklch(0.72 0.012 248)',
        accent: 'oklch(0.296 0.034 242)',
        accentForeground: 'oklch(0.962 0.005 250)',
        primary: 'oklch(0.74 0.09 242)',
        primaryForeground: 'oklch(0.15 0.01 248)',
        support: 'oklch(0.72 0.058 196)',
        supportForeground: 'oklch(0.132 0.01 200)',
        border: 'oklch(0.316 0.016 248)',
        ring: 'oklch(0.784 0.1 242)',
      },
    },
  },
  'tide-blue': {
    option: {
      id: 'tide-blue',
      label: 'Tide Blue',
      description:
        'A colder maritime variant with blue-slate structure and brighter aqua support for navigation and status scanability.',
      themeHex: '#6f95d8',
      accentHex: '#30405b',
      supportHex: '#63a7a5',
      swatches: ['#172032', '#6f95d8', '#63a7a5'],
      featured: true,
    },
    semanticFamily: 'cool-console',
    palettes: {
      light: {
        background: 'oklch(0.976 0.011 224)',
        foreground: 'oklch(0.246 0.026 230)',
        card: 'oklch(0.992 0.006 224)',
        popover: 'oklch(0.995 0.006 224)',
        secondary: 'oklch(0.946 0.016 220)',
        muted: 'oklch(0.955 0.015 220)',
        mutedForeground: 'oklch(0.484 0.022 224)',
        accent: 'oklch(0.919 0.04 220)',
        accentForeground: 'oklch(0.236 0.024 232)',
        primary: 'oklch(0.588 0.112 220)',
        primaryForeground: 'oklch(0.988 0.003 228)',
        support: 'oklch(0.636 0.082 194)',
        supportForeground: 'oklch(0.988 0.003 228)',
        border: 'oklch(0.868 0.019 220)',
        ring: 'oklch(0.662 0.118 220)',
      },
      dark: {
        background: 'oklch(0.17 0.014 232)',
        foreground: 'oklch(0.952 0.007 232)',
        card: 'oklch(0.206 0.016 232)',
        popover: 'oklch(0.218 0.016 232)',
        secondary: 'oklch(0.249 0.018 232)',
        muted: 'oklch(0.238 0.017 232)',
        mutedForeground: 'oklch(0.724 0.014 232)',
        accent: 'oklch(0.302 0.04 224)',
        accentForeground: 'oklch(0.964 0.006 232)',
        primary: 'oklch(0.75 0.106 224)',
        primaryForeground: 'oklch(0.152 0.012 232)',
        support: 'oklch(0.736 0.076 194)',
        supportForeground: 'oklch(0.13 0.011 194)',
        border: 'oklch(0.324 0.02 232)',
        ring: 'oklch(0.79 0.112 224)',
      },
    },
  },
  'warm-graphite': {
    option: {
      id: 'warm-graphite',
      label: 'Warm Graphite',
      description:
        'Dark graphite with bronze theme color and muted olive support for a calmer, more material control room feel.',
      themeHex: '#c2875d',
      accentHex: '#443126',
      supportHex: '#6b8c72',
      swatches: ['#1b1715', '#c2875d', '#6b8c72'],
      featured: true,
    },
    semanticFamily: 'warm-console',
    palettes: {
      light: {
        background: 'oklch(0.979 0.006 62)',
        foreground: 'oklch(0.275 0.015 48)',
        card: 'oklch(0.994 0.003 62)',
        popover: 'oklch(0.996 0.003 62)',
        secondary: 'oklch(0.951 0.009 58)',
        muted: 'oklch(0.958 0.008 58)',
        mutedForeground: 'oklch(0.502 0.015 56)',
        accent: 'oklch(0.924 0.028 50)',
        accentForeground: 'oklch(0.266 0.016 48)',
        primary: 'oklch(0.61 0.085 46)',
        primaryForeground: 'oklch(0.988 0.003 62)',
        support: 'oklch(0.6 0.056 146)',
        supportForeground: 'oklch(0.988 0.003 62)',
        border: 'oklch(0.876 0.013 58)',
        ring: 'oklch(0.682 0.09 46)',
      },
      dark: {
        background: 'oklch(0.175 0.011 42)',
        foreground: 'oklch(0.95 0.005 68)',
        card: 'oklch(0.213 0.012 42)',
        popover: 'oklch(0.224 0.012 42)',
        secondary: 'oklch(0.257 0.014 42)',
        muted: 'oklch(0.245 0.013 42)',
        mutedForeground: 'oklch(0.724 0.009 60)',
        accent: 'oklch(0.304 0.03 44)',
        accentForeground: 'oklch(0.964 0.004 68)',
        primary: 'oklch(0.756 0.09 44)',
        primaryForeground: 'oklch(0.154 0.01 42)',
        support: 'oklch(0.71 0.06 146)',
        supportForeground: 'oklch(0.13 0.01 146)',
        border: 'oklch(0.332 0.016 42)',
        ring: 'oklch(0.8 0.095 44)',
      },
    },
  },
  'graphite-red': {
    option: {
      id: 'graphite-red',
      label: 'Graphite Red',
      description:
        'Graphite surfaces with softened brick-red emphasis, paper-warm layering, and walnut support for focused writing and reading.',
      themeHex: '#b86460',
      accentHex: '#4a3735',
      supportHex: '#8c756d',
      swatches: ['#1d1919', '#b86460', '#8c756d'],
    },
    semanticFamily: 'signal-console',
    palettes: {
      light: {
        background: 'oklch(0.98 0.005 28)',
        foreground: 'oklch(0.288 0.012 26)',
        card: 'oklch(0.995 0.003 28)',
        popover: 'oklch(0.997 0.003 28)',
        secondary: 'oklch(0.952 0.007 26)',
        muted: 'oklch(0.959 0.007 26)',
        mutedForeground: 'oklch(0.508 0.013 24)',
        accent: 'oklch(0.926 0.024 24)',
        accentForeground: 'oklch(0.292 0.012 26)',
        primary: 'oklch(0.594 0.088 24)',
        primaryForeground: 'oklch(0.988 0.002 24)',
        support: 'oklch(0.612 0.026 42)',
        supportForeground: 'oklch(0.988 0.002 24)',
        border: 'oklch(0.884 0.011 24)',
        ring: 'oklch(0.668 0.096 24)',
      },
      dark: {
        background: 'oklch(0.166 0.014 18)',
        foreground: 'oklch(0.946 0.004 28)',
        card: 'oklch(0.202 0.016 18)',
        popover: 'oklch(0.214 0.016 18)',
        secondary: 'oklch(0.246 0.018 18)',
        muted: 'oklch(0.235 0.017 18)',
        mutedForeground: 'oklch(0.716 0.008 22)',
        accent: 'oklch(0.294 0.036 20)',
        accentForeground: 'oklch(0.964 0.004 24)',
        primary: 'oklch(0.714 0.1 22)',
        primaryForeground: 'oklch(0.146 0.008 22)',
        support: 'oklch(0.688 0.036 38)',
        supportForeground: 'oklch(0.126 0.008 38)',
        border: 'oklch(0.314 0.02 18)',
        ring: 'oklch(0.762 0.108 22)',
      },
    },
  },
  'midnight-oled': {
    option: {
      id: 'midnight-oled',
      label: 'Midnight Core',
      description:
        'The deepest dark preset, built for night work with restrained steel focus and a quiet indigo support layer.',
      themeHex: '#8d9ed3',
      accentHex: '#232a3d',
      supportHex: '#6d7bc4',
      swatches: ['#0f1218', '#8d9ed3', '#6d7bc4'],
    },
    semanticFamily: 'cool-console',
    palettes: {
      light: {
        background: 'oklch(0.968 0.012 266)',
        foreground: 'oklch(0.232 0.022 258)',
        card: 'oklch(0.986 0.007 266)',
        popover: 'oklch(0.989 0.007 266)',
        secondary: 'oklch(0.939 0.015 262)',
        muted: 'oklch(0.948 0.014 262)',
        mutedForeground: 'oklch(0.474 0.022 260)',
        accent: 'oklch(0.912 0.044 254)',
        accentForeground: 'oklch(0.23 0.021 258)',
        primary: 'oklch(0.556 0.102 246)',
        primaryForeground: 'oklch(0.988 0.002 260)',
        support: 'oklch(0.552 0.094 290)',
        supportForeground: 'oklch(0.988 0.002 260)',
        border: 'oklch(0.858 0.021 262)',
        ring: 'oklch(0.636 0.112 246)',
      },
      dark: {
        background: 'oklch(0.118 0.006 250)',
        foreground: 'oklch(0.956 0.004 252)',
        card: 'oklch(0.154 0.007 250)',
        popover: 'oklch(0.168 0.007 250)',
        secondary: 'oklch(0.205 0.009 250)',
        muted: 'oklch(0.194 0.008 250)',
        mutedForeground: 'oklch(0.706 0.008 252)',
        accent: 'oklch(0.25 0.026 244)',
        accentForeground: 'oklch(0.968 0.003 252)',
        primary: 'oklch(0.792 0.082 242)',
        primaryForeground: 'oklch(0.11 0.006 250)',
        support: 'oklch(0.72 0.074 282)',
        supportForeground: 'oklch(0.104 0.006 282)',
        border: 'oklch(0.274 0.01 250)',
        ring: 'oklch(0.83 0.09 242)',
      },
    },
  },
  'classic-red': {
    option: {
      id: 'classic-red',
      label: 'Signal Red',
      description:
        'Graphite surfaces with command-red theme emphasis and cool steel support for stronger action contrast.',
      themeHex: '#cd6d69',
      accentHex: '#46302f',
      supportHex: '#a07c61',
      swatches: ['#1d1718', '#cd6d69', '#a07c61'],
    },
    semanticFamily: 'signal-console',
    palettes: {
      light: {
        background: 'oklch(0.979 0.004 24)',
        foreground: 'oklch(0.282 0.016 22)',
        card: 'oklch(0.989 0.003 24)',
        popover: 'oklch(0.992 0.003 24)',
        secondary: 'oklch(0.954 0.005 24)',
        muted: 'oklch(0.96 0.005 24)',
        mutedForeground: 'oklch(0.552 0.011 22)',
        accent: 'oklch(0.941 0.013 24)',
        accentForeground: 'oklch(0.285 0.016 22)',
        primary: 'oklch(0.6 0.105 24)',
        primaryForeground: 'oklch(0.988 0.002 24)',
        support: 'oklch(0.62 0.044 58)',
        supportForeground: 'oklch(0.988 0.002 24)',
        border: 'oklch(0.9 0.007 24)',
        ring: 'oklch(0.676 0.114 24)',
      },
      dark: {
        background: 'oklch(0.172 0.011 22)',
        foreground: 'oklch(0.948 0.005 24)',
        card: 'oklch(0.21 0.012 22)',
        popover: 'oklch(0.223 0.012 22)',
        secondary: 'oklch(0.255 0.013 22)',
        muted: 'oklch(0.243 0.012 22)',
        mutedForeground: 'oklch(0.722 0.007 24)',
        accent: 'oklch(0.29 0.026 24)',
        accentForeground: 'oklch(0.964 0.004 24)',
        primary: 'oklch(0.76 0.112 24)',
        primaryForeground: 'oklch(0.148 0.01 22)',
        support: 'oklch(0.722 0.052 58)',
        supportForeground: 'oklch(0.128 0.01 58)',
        border: 'oklch(0.326 0.015 22)',
        ring: 'oklch(0.806 0.12 24)',
      },
    },
  },
  'red-graphite-oled': {
    option: {
      id: 'red-graphite-oled',
      label: 'Forge Red OLED',
      description:
        'An OLED-leaning red preset with darker chrome surfaces and sharper action contrast for night sessions.',
      themeHex: '#df6c67',
      accentHex: '#372322',
      supportHex: '#b18669',
      swatches: ['#120e0f', '#df6c67', '#b18669'],
    },
    semanticFamily: 'signal-console',
    palettes: {
      light: {
        background: 'oklch(0.978 0.003 22)',
        foreground: 'oklch(0.27 0.015 22)',
        card: 'oklch(0.989 0.002 22)',
        popover: 'oklch(0.992 0.002 22)',
        secondary: 'oklch(0.953 0.004 22)',
        muted: 'oklch(0.959 0.004 22)',
        mutedForeground: 'oklch(0.548 0.01 22)',
        accent: 'oklch(0.94 0.011 22)',
        accentForeground: 'oklch(0.27 0.015 22)',
        primary: 'oklch(0.616 0.118 24)',
        primaryForeground: 'oklch(0.988 0.002 22)',
        support: 'oklch(0.616 0.046 58)',
        supportForeground: 'oklch(0.988 0.002 22)',
        border: 'oklch(0.897 0.006 22)',
        ring: 'oklch(0.692 0.126 24)',
      },
      dark: {
        background: 'oklch(0.108 0.004 22)',
        foreground: 'oklch(0.954 0.004 24)',
        card: 'oklch(0.144 0.005 22)',
        popover: 'oklch(0.16 0.006 22)',
        secondary: 'oklch(0.195 0.007 22)',
        muted: 'oklch(0.184 0.006 22)',
        mutedForeground: 'oklch(0.704 0.006 24)',
        accent: 'oklch(0.224 0.02 22)',
        accentForeground: 'oklch(0.968 0.003 24)',
        primary: 'oklch(0.804 0.122 24)',
        primaryForeground: 'oklch(0.102 0.004 22)',
        support: 'oklch(0.736 0.056 58)',
        supportForeground: 'oklch(0.102 0.004 58)',
        border: 'oklch(0.264 0.008 22)',
        ring: 'oklch(0.842 0.13 24)',
      },
    },
  },
  'soft-parchment': {
    option: {
      id: 'soft-parchment',
      label: 'Paper Console',
      description:
        'A lighter editorial preset with parchment neutrals, tobacco theme color, and sage support for daytime work.',
      themeHex: '#b48a57',
      accentHex: '#594736',
      supportHex: '#7d9074',
      swatches: ['#f3eee1', '#b48a57', '#7d9074'],
    },
    semanticFamily: 'warm-console',
    palettes: {
      light: {
        background: 'oklch(0.984 0.007 95)',
        foreground: 'oklch(0.3 0.013 75)',
        card: 'oklch(0.997 0.003 95)',
        popover: 'oklch(0.998 0.003 95)',
        secondary: 'oklch(0.956 0.008 90)',
        muted: 'oklch(0.963 0.008 90)',
        mutedForeground: 'oklch(0.514 0.013 78)',
        accent: 'oklch(0.925 0.022 86)',
        accentForeground: 'oklch(0.28 0.014 75)',
        primary: 'oklch(0.61 0.072 82)',
        primaryForeground: 'oklch(0.99 0.003 95)',
        support: 'oklch(0.6 0.046 150)',
        supportForeground: 'oklch(0.99 0.003 95)',
        border: 'oklch(0.882 0.01 90)',
        ring: 'oklch(0.692 0.08 82)',
      },
      dark: {
        background: 'oklch(0.188 0.011 78)',
        foreground: 'oklch(0.948 0.005 95)',
        card: 'oklch(0.226 0.012 78)',
        popover: 'oklch(0.239 0.012 78)',
        secondary: 'oklch(0.281 0.014 80)',
        muted: 'oklch(0.269 0.013 80)',
        mutedForeground: 'oklch(0.724 0.008 86)',
        accent: 'oklch(0.318 0.028 80)',
        accentForeground: 'oklch(0.966 0.004 95)',
        primary: 'oklch(0.762 0.074 82)',
        primaryForeground: 'oklch(0.176 0.009 80)',
        support: 'oklch(0.712 0.05 150)',
        supportForeground: 'oklch(0.124 0.007 150)',
        border: 'oklch(0.338 0.015 80)',
        ring: 'oklch(0.806 0.086 82)',
      },
    },
  },
};

function sanitizeHexColor(value: string): string {
  return value.trim().toLowerCase();
}

function createThemeId(): string {
  return `theme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!CUSTOM_ACCENT_PATTERN.test(hex)) {
    return null;
  }

  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function getRelativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return 0;
  }

  const normalizeChannel = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };

  const r = normalizeChannel(rgb.r);
  const g = normalizeChannel(rgb.g);
  const b = normalizeChannel(rgb.b);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getReadableForeground(hex: string): string {
  return getRelativeLuminance(hex) > 0.45
    ? CUSTOM_ACCENT_DARK_FOREGROUND
    : CUSTOM_ACCENT_LIGHT_FOREGROUND;
}

function resolveSemanticPresetFamily(preset: ColorPreset): SemanticPresetFamily {
  return presetDefinitions[normalizeColorPreset(preset)]?.semanticFamily ?? 'cool-console';
}

function resolveCustomThemeSemanticVariables(
  customTheme: CustomThemeDocument,
  mode: ResolvedThemeMode,
  fallbackPreset: ColorPreset
): ThemeVariableMap {
  const semanticPreset = customTheme.sourcePresetId ?? fallbackPreset;
  return semanticColorVariables[resolveSemanticPresetFamily(semanticPreset)][mode];
}

function createCustomAccentOverrides(
  mode: ResolvedThemeMode,
  foundation: ThemeVariableMap,
  customAccentColor: string
): ThemeVariableMap {
  const sanitizedAccent = sanitizeCustomAccentColor(customAccentColor);
  if (!sanitizedAccent) {
    return {};
  }

  const accentWeight = mode === 'dark' ? '18%' : '12%';
  const backgroundWeight = mode === 'dark' ? '82%' : '88%';
  const customForeground = getReadableForeground(sanitizedAccent);

  return {
    '--primary': sanitizedAccent,
    '--primary-foreground': customForeground,
    '--theme': sanitizedAccent,
    '--theme-foreground': customForeground,
    '--accent': `color-mix(in oklch, ${sanitizedAccent} ${accentWeight}, ${foundation['--card']} ${backgroundWeight})`,
    '--accent-foreground': foundation['--foreground'],
    '--ring': sanitizedAccent,
  };
}

function createDerivedColorVariables(
  mode: ResolvedThemeMode,
  foundation: ThemeVariableMap,
  semantic: ThemeVariableMap
): ThemeVariableMap {
  const theme = foundation['--theme'];
  const background = foundation['--background'];
  const foreground = foundation['--foreground'];
  const card = foundation['--card'];
  const popover = foundation['--popover'];
  const border = foundation['--border'];
  const muted = foundation['--muted'];
  const mutedForeground = foundation['--muted-foreground'];
  const accent = foundation['--accent'];
  const support = foundation['--support'];
  const destructive = semantic['--destructive'];
  const success = semantic['--success'];
  const warning = semantic['--warning'];
  const info = semantic['--info'];
  const accentSoft = mixToken(theme, background, mode === 'dark' ? '16%' : '12%');

  return {
    '--accent-soft': accentSoft,
    '--accent-strong': mixToken(theme, background, mode === 'dark' ? '80%' : '74%'),
    '--support-soft': mixToken(support, background, mode === 'dark' ? '16%' : '12%'),
    '--surface-base': background,
    '--surface-elevated': card,
    '--surface-overlay': popover,
    '--panel': mixToken(card, accentSoft, mode === 'dark' ? '84%' : '86%'),
    '--panel-foreground': foreground,
    '--panel-border': mixToken(border, theme, mode === 'dark' ? '62%' : '68%'),
    '--chart-1': theme,
    '--chart-2': support,
    '--chart-3': info,
    '--chart-4': warning,
    '--chart-5': success,
    '--diff-added': mixToken(success, background, mode === 'dark' ? '20%' : '18%'),
    '--diff-removed': mixToken(destructive, background, mode === 'dark' ? '18%' : '16%'),
    '--diff-modified': mixToken(warning, background, mode === 'dark' ? '20%' : '18%'),
    '--control-surface': mixToken(card, accentSoft, mode === 'dark' ? '84%' : '86%'),
    '--control-surface-muted': mixToken(muted, background, mode === 'dark' ? '82%' : '86%'),
    '--control-border-strong': mixToken(border, theme, mode === 'dark' ? '62%' : '68%'),
    '--control-border-soft': `color-mix(in oklch, ${border} ${mode === 'dark' ? '84%' : '86%'}, transparent)`,
    '--control-shadow':
      mode === 'dark'
        ? `0 2px 10px color-mix(in oklch, ${background} 68%, transparent)`
        : `0 2px 10px color-mix(in oklch, ${foreground} 6%, transparent)`,
    '--control-chip-bg': mixToken(accent, background, mode === 'dark' ? '76%' : '78%'),
    '--control-idle': mixToken(mutedForeground, border, mode === 'dark' ? '62%' : '58%'),
    '--control-live': mixToken(success, theme, mode === 'dark' ? '84%' : '82%'),
    '--control-wait': mixToken(warning, theme, mode === 'dark' ? '88%' : '86%'),
    '--control-done': mixToken(info, support, mode === 'dark' ? '64%' : '62%'),
    '--sidebar': mixToken(background, muted, mode === 'dark' ? '96%' : '97%'),
    '--sidebar-foreground': foreground,
    '--sidebar-primary': mixToken(theme, background, mode === 'dark' ? '82%' : '84%'),
    '--sidebar-primary-foreground': foundation['--primary-foreground'],
    '--sidebar-accent': mixToken(accent, background, mode === 'dark' ? '84%' : '78%'),
    '--sidebar-accent-foreground': foreground,
    '--sidebar-border': `color-mix(in oklch, ${border} ${mode === 'dark' ? '84%' : '82%'}, transparent)`,
    '--sidebar-ring': foundation['--ring'],
  };
}

export const APP_COLOR_PRESET_OPTIONS: ColorPresetOption[] = [
  presetDefinitions['graphite-ink'].option,
  presetDefinitions['graphite-red'].option,
  presetDefinitions['tide-blue'].option,
  presetDefinitions['warm-graphite'].option,
  presetDefinitions['midnight-oled'].option,
  presetDefinitions['soft-parchment'].option,
];

export function normalizeColorPreset(preset: ColorPreset): ColorPreset {
  return RETIRED_COLOR_PRESET_MAP[preset] ?? preset;
}

export function getColorPresetOption(preset: ColorPreset): ColorPresetOption {
  return (
    presetDefinitions[normalizeColorPreset(preset)]?.option ??
    presetDefinitions['graphite-ink'].option
  );
}

export function resolvePresetThemeTokens(
  preset: ColorPreset,
  mode: ResolvedThemeMode
): ThemeTokenSet {
  const presetDefinition =
    presetDefinitions[normalizeColorPreset(preset)] ?? presetDefinitions['graphite-ink'];
  return createThemeTokenSet(
    presetDefinition.palettes[mode],
    semanticColorVariables[presetDefinition.semanticFamily][mode]
  );
}

export function createCustomThemeFromPresetDocument(
  preset: ColorPreset,
  name?: string
): CustomThemeDocument {
  const normalizedPreset = normalizeColorPreset(preset);
  const option = getColorPresetOption(normalizedPreset);
  const now = Date.now();

  return {
    id: createThemeId(),
    name: name?.trim() || `${option.label} Copy`,
    sourceType: 'preset',
    sourcePresetId: normalizedPreset,
    createdAt: now,
    updatedAt: now,
    tokens: {
      light: resolvePresetThemeTokens(normalizedPreset, 'light'),
      dark: resolvePresetThemeTokens(normalizedPreset, 'dark'),
    },
  };
}

export function createBlankCustomThemeDocument(): CustomThemeDocument {
  const now = Date.now();

  return {
    id: createThemeId(),
    name: 'Untitled Theme',
    sourceType: 'blank',
    createdAt: now,
    updatedAt: now,
    tokens: {
      light: resolvePresetThemeTokens('soft-parchment', 'light'),
      dark: resolvePresetThemeTokens('graphite-ink', 'dark'),
    },
  };
}

export function findCustomThemeBySelection(
  customThemes: CustomThemeDocument[],
  selection: ThemeSelection
): CustomThemeDocument | null {
  if (selection.kind !== 'custom') {
    return null;
  }

  return customThemes.find((theme) => theme.id === selection.customThemeId) ?? null;
}

export function sanitizeCustomAccentColor(value: string): string {
  const sanitizedValue = sanitizeHexColor(value);
  return CUSTOM_ACCENT_PATTERN.test(sanitizedValue) ? sanitizedValue : '';
}

export function resolveColorPresetVariables(
  mode: ResolvedThemeMode,
  preset: ColorPreset,
  customAccentColor: string
): ThemeVariableMap {
  const presetDefinition =
    presetDefinitions[normalizeColorPreset(preset)] ?? presetDefinitions['graphite-ink'];
  const foundation = createFoundationPalette(presetDefinition.palettes[mode]);
  const semanticVariables = semanticColorVariables[presetDefinition.semanticFamily][mode];
  const accentOverrides = createCustomAccentOverrides(mode, foundation, customAccentColor);
  const resolvedFoundation = {
    ...foundation,
    ...accentOverrides,
  };
  const derivedVariables = createDerivedColorVariables(mode, resolvedFoundation, semanticVariables);

  return {
    ...resolvedFoundation,
    ...semanticVariables,
    ...derivedVariables,
  };
}

export function resolveThemeVariables({
  mode,
  preset,
  customAccentColor,
  customTheme,
}: {
  mode: ResolvedThemeMode;
  preset: ColorPreset;
  customAccentColor?: string;
  customTheme?: CustomThemeDocument | null;
}): ThemeVariableMap {
  if (!customTheme) {
    return resolveColorPresetVariables(mode, preset, customAccentColor ?? '');
  }

  const foundation = createFoundationPalette(
    createFoundationFromThemeTokens(customTheme.tokens[mode])
  );
  const semanticVariables = resolveCustomThemeSemanticVariables(customTheme, mode, preset);
  const derivedVariables = createDerivedColorVariables(mode, foundation, semanticVariables);

  return {
    ...foundation,
    ...semanticVariables,
    ...derivedVariables,
  };
}
