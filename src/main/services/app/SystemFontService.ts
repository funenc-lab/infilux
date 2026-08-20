import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SystemFontCatalog } from '@shared/types';

const execFileAsync = promisify(execFile);
const FONT_DISCOVERY_TIMEOUT_MS = 8_000;
const FONT_DISCOVERY_MAX_BUFFER_BYTES = 1024 * 1024;

const MACOS_FONT_DISCOVERY_SCRIPT = [
  "ObjC.import('AppKit');",
  'const manager = $.NSFontManager.sharedFontManager;',
  'const families = ObjC.deepUnwrap(manager.availableFontFamilies);',
  'const monospaceFamilies = families.filter((family) => {',
  'const members = ObjC.deepUnwrap(manager.availableMembersOfFontFamily($(family))) || [];',
  'return members.some((member) => (member[3] & 1024) !== 0);',
  '});',
  'JSON.stringify({ families, monospaceFamilies });',
].join(' ');

const WINDOWS_FONT_DISCOVERY_SCRIPT = [
  'Add-Type -AssemblyName System.Drawing;',
  '$collection = New-Object System.Drawing.Text.InstalledFontCollection;',
  '$bitmap = New-Object System.Drawing.Bitmap 1, 1;',
  '$graphics = [System.Drawing.Graphics]::FromImage($bitmap);',
  '$format = [System.Drawing.StringFormat]::GenericTypographic;',
  'try {',
  '$families = @($collection.Families | ForEach-Object { $_.Name });',
  '$monospaceFamilies = @($collection.Families | ForEach-Object {',
  '$font = $null;',
  'try {',
  '$font = New-Object System.Drawing.Font($_, 12);',
  '$narrow = $graphics.MeasureString("iiiiiiii", $font, [System.Drawing.PointF]::Empty, $format).Width;',
  '$wide = $graphics.MeasureString("WWWWWWWW", $font, [System.Drawing.PointF]::Empty, $format).Width;',
  'if ([Math]::Abs($narrow - $wide) -lt 0.01) { $_.Name }',
  '} catch {} finally { if ($font) { $font.Dispose() } }',
  '});',
  '@{ families = $families; monospaceFamilies = $monospaceFamilies } | ConvertTo-Json -Compress;',
  '} finally {',
  '$format.Dispose();',
  '$graphics.Dispose();',
  '$bitmap.Dispose();',
  '$collection.Dispose();',
  '}',
].join(' ');

type FontDiscoveryPlatform = 'darwin' | 'linux' | 'win32' | (string & {});

export type SystemFontCommandRunner = (command: string, args: readonly string[]) => Promise<string>;

export interface SystemFontServiceOptions {
  platform?: FontDiscoveryPlatform;
  runCommand?: SystemFontCommandRunner;
}

function normalizeFontFamilies(fontFamilies: readonly string[]): string[] {
  const uniqueFontFamilies = new Map<string, string>();

  for (const fontFamily of fontFamilies) {
    const normalizedFontFamily = fontFamily.trim();
    if (!normalizedFontFamily || normalizedFontFamily.includes('\0')) {
      continue;
    }

    uniqueFontFamilies.set(normalizedFontFamily.toLocaleLowerCase(), normalizedFontFamily);
  }

  return Array.from(uniqueFontFamilies.values()).sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' })
  );
}

function parseJsonFontCatalog(output: string): SystemFontCatalog {
  const parsed: unknown = JSON.parse(output);

  if (Array.isArray(parsed)) {
    return {
      families: parsed.filter((fontFamily): fontFamily is string => typeof fontFamily === 'string'),
      monospaceFamilies: [],
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { families: [], monospaceFamilies: [] };
  }

  const { families, monospaceFamilies } = parsed as {
    families?: unknown;
    monospaceFamilies?: unknown;
  };

  return {
    families: Array.isArray(families)
      ? families.filter((fontFamily): fontFamily is string => typeof fontFamily === 'string')
      : [],
    monospaceFamilies: Array.isArray(monospaceFamilies)
      ? monospaceFamilies.filter(
          (fontFamily): fontFamily is string => typeof fontFamily === 'string'
        )
      : [],
  };
}

function parseFontconfigFontFamilies(output: string): string[] {
  return output
    .split('\n')
    .flatMap((line) => line.split(','))
    .map((fontFamily) => fontFamily.trim());
}

async function runSystemFontCommand(command: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    encoding: 'utf8',
    maxBuffer: FONT_DISCOVERY_MAX_BUFFER_BYTES,
    timeout: FONT_DISCOVERY_TIMEOUT_MS,
    windowsHide: true,
  });

  return stdout;
}

export class SystemFontService {
  private readonly platform: FontDiscoveryPlatform;
  private readonly runCommand: SystemFontCommandRunner;
  private fontCatalogPromise: Promise<SystemFontCatalog> | null = null;

  constructor({
    platform = process.platform,
    runCommand = runSystemFontCommand,
  }: SystemFontServiceOptions = {}) {
    this.platform = platform;
    this.runCommand = runCommand;
  }

  async listFontFamilies(): Promise<string[]> {
    return (await this.listFontCatalog()).families;
  }

  listFontCatalog(): Promise<SystemFontCatalog> {
    this.fontCatalogPromise ??= this.discoverFontCatalog();
    return this.fontCatalogPromise;
  }

  private async discoverFontCatalog(): Promise<SystemFontCatalog> {
    try {
      const fontCatalog = await this.listPlatformFontCatalog();
      return {
        families: normalizeFontFamilies(fontCatalog.families),
        monospaceFamilies: normalizeFontFamilies(fontCatalog.monospaceFamilies),
      };
    } catch {
      return { families: [], monospaceFamilies: [] };
    }
  }

  private async listPlatformFontCatalog(): Promise<SystemFontCatalog> {
    if (this.platform === 'darwin') {
      const output = await this.runCommand('osascript', [
        '-l',
        'JavaScript',
        '-e',
        MACOS_FONT_DISCOVERY_SCRIPT,
      ]);
      return parseJsonFontCatalog(output);
    }

    if (this.platform === 'linux') {
      const [fontOutput, monospaceFontOutput] = await Promise.all([
        this.runCommand('fc-list', ['--format=%{family}\n']),
        this.runCommand('fc-list', ['--format=%{family}\n', ':spacing=100']),
      ]);
      return {
        families: parseFontconfigFontFamilies(fontOutput),
        monospaceFamilies: parseFontconfigFontFamilies(monospaceFontOutput),
      };
    }

    if (this.platform === 'win32') {
      const output = await this.runCommand('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        WINDOWS_FONT_DISCOVERY_SCRIPT,
      ]);
      return parseJsonFontCatalog(output);
    }

    return { families: [], monospaceFamilies: [] };
  }
}

export const systemFontService = new SystemFontService();
