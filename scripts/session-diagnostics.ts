#!/usr/bin/env npx tsx

import { execFile } from 'node:child_process';
import { access, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const DEFAULT_DB_PATH = join(homedir(), '.infilux', 'persistent-agent-sessions.db');
const DEFAULT_LOG_DIR = join(homedir(), 'Library', 'Logs', 'Infilux');
const DEFAULT_TMUX_DIR = join(homedir(), '.infilux', 'tmux');
const DEFAULT_LOG_FILE_PREFIX = 'infilux-';
const DEFAULT_LOG_TAIL_LINES = 300;
const DEFAULT_LOG_ISSUE_LIMIT = 20;
const DEFAULT_LOG_SINCE_MINUTES = 60;

const LOG_ISSUE_PATTERNS = [
  /Failed to recover tmux server/i,
  /session:create/i,
  /posix_openpt/i,
  /app-update\.yml/i,
  /worktree:list/i,
  /not a git repository/i,
  /\[exited\]/i,
  /target\.hasAttribute/i,
];

export interface SessionStateCount {
  state: string;
  count: number;
}

export interface MissingHostSession {
  hostSessionKey: string;
  displayName: string;
  cwd: string;
}

export interface LogIssue {
  filePath: string;
  line: string;
}

export interface SessionDiagnosticsInput {
  stateCounts: SessionStateCount[];
  dbLiveSessions: string[];
  tmuxLiveSessions: string[];
  missingHostSessions: MissingHostSession[];
  logIssues: LogIssue[];
  tmuxErrors: string[];
  warnings: string[];
}

export interface SessionDiagnosticsReport extends SessionDiagnosticsInput {
  generatedAt: string;
  summary: {
    dbLiveCount: number;
    tmuxLiveCount: number;
    missingInTmuxCount: number;
    orphanTmuxCount: number;
    missingHostSessionCount: number;
    logIssueCount: number;
    warningCount: number;
    healthy: boolean;
  };
  missingInTmux: string[];
  orphanTmux: string[];
}

interface CliOptions {
  dbPath: string;
  logDir: string;
  tmuxDir: string;
  logTailLines: number;
  logSinceEpochMs: number | null;
  json: boolean;
}

export function parseCountRows(output: string): SessionStateCount[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [state, countValue] = line.split('|');
      return {
        state,
        count: Number(countValue) || 0,
      };
    });
}

export function buildSessionDiagnosticsReport(
  input: SessionDiagnosticsInput
): SessionDiagnosticsReport {
  const dbLive = new Set(input.dbLiveSessions);
  const tmuxLive = new Set(input.tmuxLiveSessions);
  const missingInTmux = input.dbLiveSessions.filter((session) => !tmuxLive.has(session));
  const orphanTmux = input.tmuxLiveSessions.filter((session) => !dbLive.has(session));
  const warningCount = input.warnings.length + input.tmuxErrors.length;

  return {
    ...input,
    generatedAt: new Date().toISOString(),
    missingInTmux,
    orphanTmux,
    summary: {
      dbLiveCount: input.dbLiveSessions.length,
      tmuxLiveCount: input.tmuxLiveSessions.length,
      missingInTmuxCount: missingInTmux.length,
      orphanTmuxCount: orphanTmux.length,
      missingHostSessionCount: input.missingHostSessions.length,
      logIssueCount: input.logIssues.length,
      warningCount,
      healthy:
        missingInTmux.length === 0 &&
        orphanTmux.length === 0 &&
        input.logIssues.length === 0 &&
        warningCount === 0,
    },
  };
}

export function formatSessionDiagnosticsReport(report: SessionDiagnosticsReport): string {
  const lines = [
    'Infilux Session Diagnostics',
    `Generated at: ${report.generatedAt}`,
    '',
    'Summary',
    `  DB live sessions: ${report.summary.dbLiveCount}`,
    `  tmux live sessions: ${report.summary.tmuxLiveCount}`,
    `  DB live missing in tmux: ${report.summary.missingInTmuxCount}`,
    `  tmux sessions not tracked by DB: ${report.summary.orphanTmuxCount}`,
    `  missing-host-session records: ${report.summary.missingHostSessionCount}`,
    `  recent log issue matches: ${report.summary.logIssueCount}`,
    `  warnings: ${report.summary.warningCount}`,
    `  healthy: ${report.summary.healthy ? 'yes' : 'no'}`,
    '',
    'Database States',
  ];

  if (report.stateCounts.length === 0) {
    lines.push('  none');
  } else {
    for (const item of report.stateCounts) {
      lines.push(`  ${item.state}: ${item.count}`);
    }
  }

  appendList(lines, 'DB Live Missing In tmux', report.missingInTmux);
  appendList(lines, 'tmux Sessions Not Tracked By DB', report.orphanTmux);

  lines.push('', 'Missing Host Sessions');
  if (report.missingHostSessions.length === 0) {
    lines.push('  none');
  } else {
    for (const item of report.missingHostSessions) {
      lines.push(`  ${item.hostSessionKey} | ${item.displayName} | ${item.cwd}`);
    }
  }

  lines.push('', 'Recent Log Issues');
  if (report.logIssues.length === 0) {
    lines.push('  none');
  } else {
    for (const issue of report.logIssues) {
      lines.push(`  ${issue.filePath}: ${issue.line}`);
    }
  }

  appendList(lines, 'tmux Errors', report.tmuxErrors);
  appendList(lines, 'Warnings', report.warnings);

  return `${lines.join('\n')}\n`;
}

function appendList(lines: string[], title: string, values: string[]): void {
  lines.push('', title);
  if (values.length === 0) {
    lines.push('  none');
    return;
  }
  for (const value of values) {
    lines.push(`  ${value}`);
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runCommand(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function runSqlite(dbPath: string, query: string): Promise<string> {
  return runCommand('sqlite3', ['-readonly', dbPath, query]);
}

function parseSessionRows(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function parseMissingHostRows(output: string): MissingHostSession[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hostSessionKey, displayName, cwd] = line.split('|');
      return {
        hostSessionKey,
        displayName,
        cwd,
      };
    });
}

async function collectDatabaseState(
  dbPath: string,
  warnings: string[]
): Promise<{
  stateCounts: SessionStateCount[];
  dbLiveSessions: string[];
  missingHostSessions: MissingHostSession[];
}> {
  if (!(await pathExists(dbPath))) {
    warnings.push(`Session database not found: ${dbPath}`);
    return {
      stateCounts: [],
      dbLiveSessions: [],
      missingHostSessions: [],
    };
  }

  try {
    const stateCounts = parseCountRows(
      await runSqlite(
        dbPath,
        'select last_known_state, count(*) from persistent_agent_sessions group by last_known_state order by last_known_state;'
      )
    );
    const dbLiveSessions = parseSessionRows(
      await runSqlite(
        dbPath,
        "select 'tmux:' || case when host_session_key like 'enso-%' then 'enso' else 'infilux' end || ':' || host_session_key from persistent_agent_sessions where last_known_state='live' order by 1;"
      )
    );
    const missingHostSessions = parseMissingHostRows(
      await runSqlite(
        dbPath,
        "select host_session_key || '|' || display_name || '|' || cwd from persistent_agent_sessions where last_known_state='missing-host-session' order by updated_at desc;"
      )
    );

    return {
      stateCounts,
      dbLiveSessions,
      missingHostSessions,
    };
  } catch (error) {
    warnings.push(`Failed to read session database: ${formatError(error)}`);
    return {
      stateCounts: [],
      dbLiveSessions: [],
      missingHostSessions: [],
    };
  }
}

async function collectTmuxState(tmuxDir: string): Promise<{
  tmuxLiveSessions: string[];
  tmuxErrors: string[];
}> {
  const servers = [
    { name: 'infilux', socketPath: join(tmuxDir, 'infilux.sock') },
    { name: 'enso', socketPath: join(tmuxDir, 'enso.sock') },
  ];
  const tmuxLiveSessions: string[] = [];
  const tmuxErrors: string[] = [];

  for (const server of servers) {
    try {
      const output = await runCommand('tmux', [
        '-S',
        server.socketPath,
        'list-sessions',
        '-F',
        `tmux:${server.name}:#S`,
      ]);
      tmuxLiveSessions.push(...parseSessionRows(output));
    } catch (error) {
      tmuxErrors.push(`${server.name}: ${formatError(error)}`);
    }
  }

  return {
    tmuxLiveSessions: tmuxLiveSessions.sort(),
    tmuxErrors,
  };
}

interface CollectLogIssuesFromContentOptions {
  filePath: string;
  content: string;
  tailLines: number;
  sinceEpochMs: number | null;
  limit: number;
}

export function collectLogIssuesFromContent({
  filePath,
  content,
  tailLines,
  sinceEpochMs,
  limit,
}: CollectLogIssuesFromContentOptions): LogIssue[] {
  const issues: LogIssue[] = [];
  const lines = content.split('\n').filter(Boolean).slice(-tailLines);

  for (const line of lines) {
    if (issues.length >= limit) {
      return issues;
    }
    if (!isLineInsideTimeWindow(line, sinceEpochMs)) {
      continue;
    }
    if (LOG_ISSUE_PATTERNS.some((pattern) => pattern.test(line))) {
      issues.push({ filePath, line });
    }
  }

  return issues;
}

function isLineInsideTimeWindow(line: string, sinceEpochMs: number | null): boolean {
  if (sinceEpochMs === null) {
    return true;
  }

  const timestampMatch = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{3})?)\]/.exec(line);
  if (!timestampMatch) {
    return false;
  }

  const lineEpochMs = new Date(timestampMatch[1].replace(' ', 'T')).getTime();
  return Number.isFinite(lineEpochMs) && lineEpochMs >= sinceEpochMs;
}

async function collectLogIssues(
  logDir: string,
  tailLines: number,
  sinceEpochMs: number | null,
  warnings: string[]
): Promise<LogIssue[]> {
  if (!(await pathExists(logDir))) {
    warnings.push(`Log directory not found: ${logDir}`);
    return [];
  }

  const entries = await readdir(logDir);
  const logFiles = entries
    .filter((entry) => entry === 'main.log' || entry.startsWith(DEFAULT_LOG_FILE_PREFIX))
    .sort()
    .reverse()
    .slice(0, 3);
  const issues: LogIssue[] = [];

  for (const fileName of logFiles) {
    const filePath = join(logDir, fileName);
    const content = await readFile(filePath, 'utf8');
    issues.push(
      ...collectLogIssuesFromContent({
        filePath,
        content,
        tailLines,
        sinceEpochMs,
        limit: DEFAULT_LOG_ISSUE_LIMIT - issues.length,
      })
    );
    if (issues.length >= DEFAULT_LOG_ISSUE_LIMIT) {
      return issues;
    }
  }

  return issues;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, ' ').trim();
  }
  return String(error);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    dbPath: DEFAULT_DB_PATH,
    logDir: DEFAULT_LOG_DIR,
    tmuxDir: DEFAULT_TMUX_DIR,
    logTailLines: DEFAULT_LOG_TAIL_LINES,
    logSinceEpochMs: Date.now() - DEFAULT_LOG_SINCE_MINUTES * 60 * 1000,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg.startsWith('--db=')) {
      options.dbPath = resolve(arg.slice('--db='.length));
      continue;
    }
    if (arg === '--db') {
      options.dbPath = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--log-dir=')) {
      options.logDir = resolve(arg.slice('--log-dir='.length));
      continue;
    }
    if (arg === '--log-dir') {
      options.logDir = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--tmux-dir=')) {
      options.tmuxDir = resolve(arg.slice('--tmux-dir='.length));
      continue;
    }
    if (arg === '--tmux-dir') {
      options.tmuxDir = resolve(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg.startsWith('--log-tail-lines=')) {
      options.logTailLines = parsePositiveInteger(
        arg.slice('--log-tail-lines='.length),
        DEFAULT_LOG_TAIL_LINES
      );
      continue;
    }
    if (arg === '--log-tail-lines') {
      options.logTailLines = parsePositiveInteger(argv[index + 1], DEFAULT_LOG_TAIL_LINES);
      index += 1;
      continue;
    }
    if (arg.startsWith('--since-minutes=')) {
      options.logSinceEpochMs =
        Date.now() -
        parsePositiveInteger(arg.slice('--since-minutes='.length), DEFAULT_LOG_SINCE_MINUTES) *
          60 *
          1000;
      continue;
    }
    if (arg === '--since-minutes') {
      options.logSinceEpochMs =
        Date.now() - parsePositiveInteger(argv[index + 1], DEFAULT_LOG_SINCE_MINUTES) * 60 * 1000;
      index += 1;
      continue;
    }
    if (arg.startsWith('--since=')) {
      options.logSinceEpochMs = parseSinceEpochMs(arg.slice('--since='.length));
      continue;
    }
    if (arg === '--since') {
      options.logSinceEpochMs = parseSinceEpochMs(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--all-logs') {
      options.logSinceEpochMs = null;
    }
  }

  return options;
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function printHelp(): void {
  process.stdout.write(`Usage: npx tsx scripts/session-diagnostics.ts [options]

Options:
  --db=<path>               Override the persistent session database path
  --log-dir=<path>          Override the Infilux log directory
  --tmux-dir=<path>         Override the Infilux tmux socket directory
  --log-tail-lines=<n>      Number of log lines to inspect from recent logs
  --since-minutes=<n>       Inspect log issues newer than this many minutes
  --since=<timestamp>       Inspect log issues newer than an ISO/local timestamp
  --all-logs                Inspect recent log tails without timestamp filtering
  --json                    Print JSON instead of a text report
  --help                    Show this message
`);
}

function parseSinceEpochMs(value: string): number | null {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const warnings: string[] = [];
  const databaseState = await collectDatabaseState(options.dbPath, warnings);
  const tmuxState = await collectTmuxState(options.tmuxDir);
  const logIssues = await collectLogIssues(
    options.logDir,
    options.logTailLines,
    options.logSinceEpochMs,
    warnings
  );
  const report = buildSessionDiagnosticsReport({
    ...databaseState,
    ...tmuxState,
    logIssues,
    warnings,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatSessionDiagnosticsReport(report));
  }

  process.exitCode = report.summary.healthy ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`Failed to collect session diagnostics: ${formatError(error)}\n`);
    process.exitCode = 1;
  });
}
