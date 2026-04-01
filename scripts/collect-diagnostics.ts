#!/usr/bin/env npx tsx

import { execFile } from 'node:child_process';
import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { LOG_FILE_PREFIX } from '../src/shared/paths';
import {
  buildDefaultDiagnosticsPaths,
  formatDiagnosticsArchivePath,
  formatDiagnosticsDirectoryName,
  listManagedLogFiles,
  sanitizeDiagnosticsLines,
  sanitizeDiagnosticsText,
  selectDiagnosticsLogFiles,
} from '../src/shared/utils/diagnostics';

const execFileAsync = promisify(execFile);
const DEFAULT_APP_NAME = 'Infilux';
const DEFAULT_TAIL_LINES = 200;
const DEFAULT_LOG_COPY_LIMIT = 3;

interface CliOptions {
  outputDir?: string;
  logDir?: string;
  appName: string;
  tailLines: number;
  archive: boolean;
  archivePath?: string;
}

interface DiagnosticsManifest {
  generatedAt: string;
  cwd: string;
  appName: string;
  outputDir: string;
  archivePath: string | null;
  paths: {
    sharedRoot: string;
    settingsPath: string;
    sessionPath: string;
    logDir: string | null;
  };
  copiedFiles: string[];
  warnings: string[];
  git: {
    repoRoot: string | null;
    head: string | null;
  };
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    appName: DEFAULT_APP_NAME,
    tailLines: DEFAULT_TAIL_LINES,
    archive: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--output-dir=')) {
      options.outputDir = arg.slice('--output-dir='.length);
      continue;
    }
    if (arg === '--output-dir') {
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--log-dir=')) {
      options.logDir = arg.slice('--log-dir='.length);
      continue;
    }
    if (arg === '--log-dir') {
      options.logDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('--app-name=')) {
      options.appName = arg.slice('--app-name='.length) || DEFAULT_APP_NAME;
      continue;
    }
    if (arg === '--app-name') {
      options.appName = argv[index + 1] || DEFAULT_APP_NAME;
      index += 1;
      continue;
    }
    if (arg.startsWith('--tail-lines=')) {
      const parsed = Number(arg.slice('--tail-lines='.length));
      if (Number.isFinite(parsed) && parsed > 0) {
        options.tailLines = Math.floor(parsed);
      }
      continue;
    }
    if (arg === '--tail-lines') {
      const parsed = Number(argv[index + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.tailLines = Math.floor(parsed);
      }
      index += 1;
      continue;
    }
    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith('--archive=')) {
      options.archive = true;
      options.archivePath = arg.slice('--archive='.length) || undefined;
      continue;
    }
    if (arg === '--archive') {
      options.archive = true;
      const nextArg = argv[index + 1];
      if (nextArg && !nextArg.startsWith('--')) {
        options.archivePath = nextArg;
        index += 1;
      }
    }
  }

  return options;
}

function printHelp(): void {
  process.stdout.write(`Usage: npx tsx scripts/collect-diagnostics.ts [options]

Options:
  --output-dir=<path>  Override the diagnostics output directory
  --log-dir=<path>     Override the application log directory
  --app-name=<name>    Override the application name used for log path discovery
  --tail-lines=<n>     Number of log lines to capture from the latest log file
  --archive[=<path>]   Create a .tar.gz archive for the diagnostics directory
  --help               Show this message
`);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(targetPath: string): Promise<void> {
  await mkdir(targetPath, { recursive: true });
}

async function readTailLines(filePath: string, lineCount: number): Promise<string[]> {
  const content = await readFile(filePath, 'utf8');
  return content
    .split('\n')
    .filter((line) => line.trim())
    .slice(-lineCount);
}

async function resolveLogDirectory(options: CliOptions): Promise<string | null> {
  if (options.logDir) {
    return (await pathExists(options.logDir)) ? resolve(options.logDir) : null;
  }

  const homeDirs = Array.from(
    new Set(
      [homedir(), userInfo().homedir]
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
  const candidates = homeDirs.flatMap(
    (homeDir) =>
      buildDefaultDiagnosticsPaths({
        homeDir,
        platform: process.platform,
        appName: options.appName,
      }).logDirCandidates
  );

  let fallbackLogDir: string | null = null;

  for (const candidate of candidates) {
    if (!(await pathExists(candidate))) {
      continue;
    }

    const logEntries = await readdir(candidate);
    const managedLogFiles = listManagedLogFiles(logEntries, LOG_FILE_PREFIX);
    if (managedLogFiles.length > 0) {
      return candidate;
    }

    if (
      fallbackLogDir === null &&
      selectDiagnosticsLogFiles(logEntries, LOG_FILE_PREFIX).length > 0
    ) {
      fallbackLogDir = candidate;
    }
  }

  return fallbackLogDir;
}

async function writeSanitizedCopyIfExists(
  sourcePath: string,
  destinationPath: string,
  copiedFiles: string[],
  warnings: string[]
): Promise<void> {
  if (!(await pathExists(sourcePath))) {
    warnings.push(`Missing optional file: ${sourcePath}`);
    return;
  }

  await ensureDirectory(dirname(destinationPath));
  const content = await readFile(sourcePath, 'utf8');
  await writeFile(destinationPath, `${sanitizeDiagnosticsText(content)}`, 'utf8');
  copiedFiles.push(destinationPath);
}

async function runGitCommand(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function writeTextFile(
  filePath: string,
  content: string,
  copiedFiles: string[]
): Promise<void> {
  await ensureDirectory(dirname(filePath));
  await writeFile(filePath, content, 'utf8');
  copiedFiles.push(filePath);
}

async function createArchive(outputDir: string, overridePath?: string): Promise<string> {
  const archivePath = formatDiagnosticsArchivePath(outputDir, overridePath);
  await ensureDirectory(dirname(archivePath));
  await execFileAsync('tar', ['-czf', archivePath, '-C', dirname(outputDir), basename(outputDir)]);
  return archivePath;
}

async function collectDiagnostics(options: CliOptions): Promise<DiagnosticsManifest> {
  const generatedAt = new Date().toISOString();
  const cwd = process.cwd();
  const outputDir = resolve(
    options.outputDir ?? join('.tmp', 'diagnostics', formatDiagnosticsDirectoryName(new Date()))
  );

  const copiedFiles: string[] = [];
  const warnings: string[] = [];
  const sharedPaths = buildDefaultDiagnosticsPaths({
    homeDir: homedir(),
    platform: process.platform,
    appName: options.appName,
  });

  await ensureDirectory(outputDir);

  await writeSanitizedCopyIfExists(
    sharedPaths.settingsPath,
    join(outputDir, 'shared-state', basename(sharedPaths.settingsPath)),
    copiedFiles,
    warnings
  );
  await writeSanitizedCopyIfExists(
    sharedPaths.sessionPath,
    join(outputDir, 'shared-state', basename(sharedPaths.sessionPath)),
    copiedFiles,
    warnings
  );

  const logDir = await resolveLogDirectory(options);
  if (logDir) {
    const logEntries = await readdir(logDir);
    const selectedLogFiles = selectDiagnosticsLogFiles(logEntries, LOG_FILE_PREFIX).slice(
      0,
      DEFAULT_LOG_COPY_LIMIT
    );

    await writeTextFile(
      join(outputDir, 'logs', 'inventory.json'),
      `${JSON.stringify({ logDir, selectedLogFiles }, null, 2)}\n`,
      copiedFiles
    );

    for (const logFileName of selectedLogFiles) {
      await writeSanitizedCopyIfExists(
        join(logDir, logFileName),
        join(outputDir, 'logs', logFileName),
        copiedFiles,
        warnings
      );
    }

    if (selectedLogFiles.length > 0) {
      const latestLogPath = join(logDir, selectedLogFiles[0]);
      const tailLines = sanitizeDiagnosticsLines(
        await readTailLines(latestLogPath, options.tailLines)
      );
      await writeTextFile(
        join(outputDir, 'logs', 'latest-tail.txt'),
        tailLines.join('\n'),
        copiedFiles
      );
    } else {
      warnings.push(`No supported log files found in ${logDir}`);
    }
  } else {
    warnings.push('No log directory could be resolved');
  }

  const repoRoot = await runGitCommand(['rev-parse', '--show-toplevel'], cwd);
  const gitHead = repoRoot ? await runGitCommand(['rev-parse', 'HEAD'], repoRoot) : null;
  const gitStatus = repoRoot ? await runGitCommand(['status', '--short'], repoRoot) : null;

  if (repoRoot) {
    await writeTextFile(
      join(outputDir, 'repo', 'head.txt'),
      `${gitHead ?? 'unknown'}\n`,
      copiedFiles
    );
    await writeTextFile(
      join(outputDir, 'repo', 'status.txt'),
      `${gitStatus ?? '(clean or unavailable)'}\n`,
      copiedFiles
    );
  } else {
    warnings.push('Current working directory is not inside a git repository');
  }

  const archivePath = options.archive
    ? formatDiagnosticsArchivePath(outputDir, options.archivePath)
    : null;

  const manifest: DiagnosticsManifest = {
    generatedAt,
    cwd,
    appName: options.appName,
    outputDir,
    archivePath,
    paths: {
      sharedRoot: sharedPaths.sharedRoot,
      settingsPath: sharedPaths.settingsPath,
      sessionPath: sharedPaths.sessionPath,
      logDir,
    },
    copiedFiles,
    warnings,
    git: {
      repoRoot,
      head: gitHead,
    },
  };

  await writeTextFile(
    join(outputDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    copiedFiles
  );

  if (archivePath) {
    await createArchive(outputDir, archivePath);
  }

  return manifest;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const manifest = await collectDiagnostics(options);

  process.stdout.write(`Diagnostics written to ${manifest.outputDir}\n`);
  if (manifest.archivePath) {
    process.stdout.write(`Archive written to ${manifest.archivePath}\n`);
  }
  process.stdout.write(`Copied ${manifest.copiedFiles.length} files\n`);
  if (manifest.warnings.length > 0) {
    process.stdout.write(`Warnings:\n`);
    for (const warning of manifest.warnings) {
      process.stdout.write(`- ${warning}\n`);
    }
  }
}

void main().catch((error) => {
  console.error('[collect-diagnostics] Failed to collect diagnostics:', error);
  process.exitCode = 1;
});
