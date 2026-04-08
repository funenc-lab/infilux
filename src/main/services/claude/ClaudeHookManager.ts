import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { APP_RUNTIME_NAMESPACE } from '@shared/utils/runtimeIdentity';
import { app } from 'electron';

interface StatusLineConfig {
  type: 'command' | 'text';
  command?: string;
  text?: string;
  padding?: number;
}

interface ClaudeSettings {
  hooks?: {
    Stop?: Array<{
      matcher?: string;
      hooks: Array<{
        type: 'command' | 'prompt';
        command?: string;
        prompt?: string;
        timeout?: number;
      }>;
    }>;
    PermissionRequest?: Array<{
      matcher?: string;
      hooks: Array<{
        type: 'command' | 'prompt';
        command?: string;
        prompt?: string;
        timeout?: number;
      }>;
    }>;
    PreToolUse?: Array<{
      matcher?: string;
      hooks: Array<{
        type: 'command' | 'prompt';
        command?: string;
        prompt?: string;
        timeout?: number;
      }>;
    }>;
    UserPromptSubmit?: Array<{
      matcher?: string;
      hooks: Array<{
        type: 'command' | 'prompt';
        command?: string;
        prompt?: string;
        timeout?: number;
      }>;
    }>;
    [key: string]: unknown;
  };
  statusLine?: StatusLineConfig;
  [key: string]: unknown;
}

interface StatusLineBackup {
  originalConfig: StatusLineConfig | null;
  backupTime: string;
}

interface ManagedCommandHook {
  type: 'command' | 'prompt';
  command?: string;
  prompt?: string;
  timeout?: number;
}

interface ManagedHookGroup {
  matcher?: string;
  hooks: ManagedCommandHook[];
}

type ManagedHookEvent = 'Stop' | 'PermissionRequest' | 'UserPromptSubmit' | 'PreToolUse';
type ManagedHookGroups = ManagedHookGroup[] | undefined;

// Hook is identified by the script path in the command.
// Use .cjs extension to force CommonJS mode regardless of user's package.json "type" setting
const HOOK_SCRIPT_NAME = `${APP_RUNTIME_NAMESPACE}-hook.cjs`;
const HOOK_MARKER = `${APP_RUNTIME_NAMESPACE}-hook`;
const LEGACY_HOOK_SCRIPT_NAMES = ['ensoai-hook.cjs', 'ensoai-stop.cjs', 'ensoai-stop.js'] as const;
const LEGACY_HOOK_MARKERS = ['ensoai-hook', 'ensoai-stop'] as const;
const MANAGED_HOOK_MARKERS = [HOOK_MARKER, ...LEGACY_HOOK_MARKERS] as const;
const STATUSLINE_SCRIPT_NAME = `${APP_RUNTIME_NAMESPACE}-statusline.cjs`;
const LEGACY_STATUSLINE_SCRIPT_NAMES = ['enso-statusline.cjs', 'enso-statusline.js'] as const;
const MANAGED_STATUSLINE_MARKERS = [
  STATUSLINE_SCRIPT_NAME,
  ...LEGACY_STATUSLINE_SCRIPT_NAMES,
] as const;

function getClaudeConfigDir(): string {
  if (process.env.CLAUDE_CONFIG_DIR) {
    return process.env.CLAUDE_CONFIG_DIR;
  }
  return path.join(os.homedir(), '.claude');
}

function getClaudeSettingsPath(): string {
  return path.join(getClaudeConfigDir(), 'settings.json');
}

function getHooksDir(): string {
  return path.join(getClaudeConfigDir(), 'hooks');
}

function getHookScriptPath(): string {
  return path.join(getHooksDir(), HOOK_SCRIPT_NAME);
}

function getLegacyHookScriptPaths(): string[] {
  return LEGACY_HOOK_SCRIPT_NAMES.map((name) => path.join(getHooksDir(), name));
}

function commandIncludesAny(command: string | undefined, markers: readonly string[]): boolean {
  return typeof command === 'string' && markers.some((marker) => command.includes(marker));
}

function hasManagedCommandHook(groups: ManagedHookGroups, markers: readonly string[]): boolean {
  return (
    groups?.some((hookGroup) =>
      hookGroup.hooks?.some(
        (hook) => hook.type === 'command' && commandIncludesAny(hook.command, markers)
      )
    ) ?? false
  );
}

function removeCommandHooksByMarker(groups: ManagedHookGroups, markers: readonly string[]) {
  if (!groups) {
    return {
      changed: false,
      groups,
    };
  }

  const nextGroups = groups.filter(
    (hookGroup) =>
      !hookGroup.hooks?.some(
        (hook) => hook.type === 'command' && commandIncludesAny(hook.command, markers)
      )
  );

  return {
    changed: nextGroups.length !== groups.length,
    groups: nextGroups,
  };
}

function migrateLegacyHookGroups(settings: ClaudeSettings, event: ManagedHookEvent): boolean {
  const existing = settings.hooks?.[event];
  const { changed, groups } = removeCommandHooksByMarker(existing, LEGACY_HOOK_MARKERS);
  if (!changed || !settings.hooks) {
    return false;
  }

  if (!groups || groups.length === 0) {
    delete settings.hooks[event];
  } else {
    settings.hooks[event] = groups;
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return true;
}

function removeManagedHookGroups(settings: ClaudeSettings, event: ManagedHookEvent): boolean {
  const existing = settings.hooks?.[event];
  const { changed, groups } = removeCommandHooksByMarker(existing, MANAGED_HOOK_MARKERS);
  if (!changed || !settings.hooks) {
    return false;
  }

  if (!groups || groups.length === 0) {
    delete settings.hooks[event];
  } else {
    settings.hooks[event] = groups;
  }

  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  return true;
}

/**
 * Node.js hook script content - runs on all platforms
 * Handles: Stop, PermissionRequest (AskUserQuestion), UserPromptSubmit
 */
function getHookScriptContent(): string {
  const ideDir = path.join(getClaudeConfigDir(), 'ide');
  // Use forward slashes for path in JS (works on all platforms)
  const ideDirJs = ideDir.replace(/\\/g, '/');

  return `// Infilux Hook - Sends agent notifications
// Auto-generated by Infilux - Do not edit manually
// Requires Node.js in PATH
// Handles: Stop, PermissionRequest (AskUserQuestion), UserPromptSubmit

const fs = require('fs');
const path = require('path');
const http = require('http');

const IDE_DIR = '${ideDirJs}';

function normalizePathForMatch(p) {
  if (typeof p !== 'string' || p.length === 0) return '';
  let normalized = p.replace(/\\\\/g, '/').replace(/\\/+$/, '');
  if (process.platform === 'win32' || process.platform === 'darwin') {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

function getPayloadCwd(data) {
  if (typeof data?.cwd === 'string') return data.cwd;
  if (typeof data?.workspace?.current_dir === 'string') return data.workspace.current_dir;
  if (typeof data?.workspace?.project_dir === 'string') return data.workspace.project_dir;
  if (typeof data?.project_dir === 'string') return data.project_dir;
  return undefined;
}

function getWorkspaceMatchScore(payloadCwd, workspaceFolders) {
  const normalizedCwd = normalizePathForMatch(payloadCwd);
  if (!normalizedCwd || !Array.isArray(workspaceFolders) || workspaceFolders.length === 0) {
    return -1;
  }

  let bestScore = -1;
  for (const folder of workspaceFolders) {
    const normalizedFolder = normalizePathForMatch(folder);
    if (!normalizedFolder) continue;

    // Match when cwd is inside workspace or workspace is inside cwd.
    if (
      normalizedCwd === normalizedFolder ||
      normalizedCwd.startsWith(normalizedFolder + '/') ||
      normalizedFolder.startsWith(normalizedCwd + '/')
    ) {
      bestScore = Math.max(bestScore, normalizedFolder.length);
    }
  }
  return bestScore;
}

function postAgentHook(port, postData) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/agent-hook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 300);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.write(postData);
    req.end();
  });
}

async function main() {
  // Read JSON from stdin
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const sessionId = data.session_id;
  if (!sessionId) {
    process.exit(0);
  }

  // Find Infilux lockfiles and send notification to the best matching workspace instance.
  // Fallback to other Infilux instances when matched lockfiles are stale.
  if (!fs.existsSync(IDE_DIR)) {
    process.exit(0);
  }

  const payloadCwd = getPayloadCwd(data);
  const lockfiles = fs.readdirSync(IDE_DIR).filter(f => f.endsWith('.lock'));
  const candidates = [];

  for (const lockfile of lockfiles) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(IDE_DIR, lockfile), 'utf-8'));
      if (content.ideName === 'Infilux') {
        const port = parseInt(path.basename(lockfile, '.lock'), 10);
        if (Number.isNaN(port)) continue;
        const score = getWorkspaceMatchScore(payloadCwd, content.workspaceFolders);
        candidates.push({ port, score });
      }
    } catch {
      // Ignore errors, try next lockfile
    }
  }

  if (candidates.length === 0) {
    process.exit(0);
  }

  // Prefer lockfiles whose workspaceFolders match payload cwd.
  // If no payload cwd or no match, keep previous resilience by trying all.
  const matched = candidates.filter(c => c.score >= 0).sort((a, b) => b.score - a.score);
  const fallback = candidates.filter(c => c.score < 0);
  const targets = matched.length > 0 ? [...matched, ...fallback] : fallback;

  const postData = JSON.stringify(data);
  for (const target of targets) {
    const ok = await postAgentHook(target.port, postData);
    if (ok) {
      break;
    }
  }
}

main().catch(() => process.exit(0));
`;
}

function ensureHookScript(): string {
  const hooksDir = getHooksDir();
  const scriptPath = getHookScriptPath();

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true, mode: 0o755 });
  }

  for (const legacyScriptPath of getLegacyHookScriptPaths()) {
    if (!fs.existsSync(legacyScriptPath)) {
      continue;
    }
    try {
      fs.unlinkSync(legacyScriptPath);
      console.log('[ClaudeHookManager] Removed legacy script:', path.basename(legacyScriptPath));
    } catch (err) {
      console.warn('[ClaudeHookManager] Failed to remove legacy script:', err);
    }
  }

  fs.writeFileSync(scriptPath, getHookScriptContent(), { mode: 0o755 });

  return scriptPath;
}

/**
 * Generate hook command that runs the script using Node.js
 * Requires Node.js to be installed and available in PATH
 */
function generateHookCommand(): string {
  const scriptPath = getHookScriptPath();
  // Use forward slashes for cross-platform compatibility
  const scriptPathCmd = scriptPath.replace(/\\/g, '/');

  return `node "${scriptPathCmd}"`;
}

/**
 * Check if Claude CLI is installed by verifying .claude directory exists
 * This prevents creating config files for users who don't have Claude installed
 */
export function isClaudeInstalled(): boolean {
  const configDir = getClaudeConfigDir();
  return fs.existsSync(configDir);
}

/**
 * Ensure the Stop hook is configured in Claude settings
 * Returns true if hook was added or already exists
 * Returns false if Claude is not installed (skips setup)
 */
export function ensureStopHook(): boolean {
  // Skip hook setup if Claude is not installed
  if (!isClaudeInstalled()) {
    console.log('[ClaudeHookManager] Claude not installed, skipping hook setup');
    return false;
  }

  try {
    const settingsPath = getClaudeSettingsPath();

    // Read existing settings or create new
    let settings: ClaudeSettings = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    // IMPORTANT: Migrate settings.json BEFORE deleting legacy script files
    // This ensures atomic migration - if settings update fails, script still exists
    const needSave = migrateLegacyHookGroups(settings, 'Stop');
    if (needSave) {
      console.log('[ClaudeHookManager] Cleaned up legacy Stop hook references from settings');
    }

    // Save migrated settings BEFORE deleting script files
    if (needSave) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
        mode: 0o600,
      });
    }

    // Now safe to update script files (settings.json is already clean)
    ensureHookScript();

    const hasCurrentHook = hasManagedCommandHook(settings.hooks?.Stop, [HOOK_MARKER]);
    if (hasCurrentHook) {
      return true;
    }

    // Initialize hooks object if needed
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = [];
    }

    // Add our hook - marker is embedded in the command for identification
    const hookCommand = generateHookCommand();
    settings.hooks.Stop.push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: hookCommand,
          timeout: 5,
        },
      ],
    });

    // Ensure directory exists
    const configDir = getClaudeConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    // Write settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });

    console.log('[ClaudeHookManager] Stop hook configured successfully');
    return true;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to configure Stop hook:', error);
    return false;
  }
}

/**
 * Remove Infilux Stop hook from Claude settings
 */
export function removeStopHook(): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();

    if (!fs.existsSync(settingsPath)) {
      return true;
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);

    if (!settings.hooks?.Stop) {
      return true;
    }

    removeManagedHookGroups(settings, 'Stop');

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });

    console.log('[ClaudeHookManager] Stop hook removed successfully');
    return true;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to remove Stop hook:', error);
    return false;
  }
}

// ============================================================================
// Status Line Hook Management
// ============================================================================

const STATUSLINE_BACKUP_FILE = 'claude-statusline-backup.json';

function getStatusLineScriptPath(): string {
  return path.join(getHooksDir(), STATUSLINE_SCRIPT_NAME);
}

function getStatusLineBackupPath(): string {
  return path.join(app.getPath('userData'), STATUSLINE_BACKUP_FILE);
}

/**
 * Generate status line script content
 */
function getStatusLineScriptContent(): string {
  const ideDir = path.join(getClaudeConfigDir(), 'ide');
  const ideDirJs = ideDir.replace(/\\/g, '/');

  return `// Infilux Status Line Hook - Forwards status data to Infilux
// Auto-generated by Infilux - Do not edit manually

const fs = require('fs');
const path = require('path');
const http = require('http');

const IDE_DIR = '${ideDirJs}';

async function main() {
  // Read JSON from stdin
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch {
    // Output empty line if parsing fails
    console.log('');
    process.exit(0);
  }

  // Find Infilux lockfiles and send status update to ALL instances
  if (fs.existsSync(IDE_DIR)) {
    const lockfiles = fs.readdirSync(IDE_DIR).filter(f => f.endsWith('.lock'));
    for (const lockfile of lockfiles) {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(IDE_DIR, lockfile), 'utf-8'));
        if (content.ideName === 'Infilux') {
          const port = path.basename(lockfile, '.lock');
          const postData = JSON.stringify(data);
          const req = http.request({
            hostname: '127.0.0.1',
            port: parseInt(port),
            path: '/status-line',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
            },
            timeout: 1000,
          });
          req.on('error', () => {});
          req.write(postData);
          req.end();
          // Don't break - send to all Infilux instances
        }
      } catch {
        // Ignore errors, try next lockfile
      }
    }
  }

  // Output empty line - don't override Claude's native status line display
  console.log('');
}

main().catch(() => {
  console.log('');
  process.exit(0);
});
`;
}

function ensureStatusLineScript(): string {
  const hooksDir = getHooksDir();
  const scriptPath = getStatusLineScriptPath();

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true, mode: 0o755 });
  }

  for (const legacyScriptName of LEGACY_STATUSLINE_SCRIPT_NAMES) {
    const legacyScriptPath = path.join(hooksDir, legacyScriptName);
    if (fs.existsSync(legacyScriptPath)) {
      fs.unlinkSync(legacyScriptPath);
    }
  }

  fs.writeFileSync(scriptPath, getStatusLineScriptContent(), { mode: 0o755 });
  return scriptPath;
}

/**
 * Generate status line command
 */
function generateStatusLineCommand(): string {
  const scriptPath = getStatusLineScriptPath();
  const scriptPathCmd = scriptPath.replace(/\\/g, '/');
  return `node "${scriptPathCmd}"`;
}

/**
 * Check if our status line hook is configured
 */
function isCurrentStatusLineHookConfigured(settings: ClaudeSettings): boolean {
  return (
    settings.statusLine?.type === 'command' &&
    (settings.statusLine?.command?.includes(STATUSLINE_SCRIPT_NAME) ?? false)
  );
}

function isManagedStatusLineHookConfigured(settings: ClaudeSettings): boolean {
  return (
    settings.statusLine?.type === 'command' &&
    commandIncludesAny(settings.statusLine.command, MANAGED_STATUSLINE_MARKERS)
  );
}

/**
 * Backup existing status line config
 */
function backupStatusLineConfig(currentConfig: StatusLineConfig | undefined): void {
  const backupPath = getStatusLineBackupPath();

  // Don't backup if already backed up
  if (fs.existsSync(backupPath)) {
    return;
  }

  const backup: StatusLineBackup = {
    originalConfig: currentConfig ?? null,
    backupTime: new Date().toISOString(),
  };

  const userDataDir = app.getPath('userData');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), { mode: 0o600 });
  console.log('[ClaudeHookManager] Status line config backed up');
}

/**
 * Restore status line config from backup
 */
function restoreStatusLineConfig(): StatusLineConfig | null | undefined {
  const backupPath = getStatusLineBackupPath();

  if (!fs.existsSync(backupPath)) {
    return undefined; // No backup exists
  }

  try {
    const content = fs.readFileSync(backupPath, 'utf-8');
    const backup: StatusLineBackup = JSON.parse(content);

    // Delete backup file after reading
    fs.unlinkSync(backupPath);

    console.log('[ClaudeHookManager] Status line config restored from backup');
    return backup.originalConfig;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to restore status line backup:', error);
    return undefined;
  }
}

/**
 * Ensure status line hook is configured
 */
export function ensureStatusLineHook(): boolean {
  if (!isClaudeInstalled()) {
    console.log('[ClaudeHookManager] Claude not installed, skipping status line hook setup');
    return false;
  }

  try {
    // Ensure script file is up-to-date
    ensureStatusLineScript();

    const settingsPath = getClaudeSettingsPath();

    let settings: ClaudeSettings = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    // TODO(v0.3.0): Remove legacy .js cleanup from settings.json
    // Clean up legacy .js reference in statusLine (file may have been deleted in previous versions)
    let needSave = false;
    if (
      settings.statusLine?.type === 'command' &&
      commandIncludesAny(settings.statusLine.command, LEGACY_STATUSLINE_SCRIPT_NAMES)
    ) {
      console.log('[ClaudeHookManager] Cleaned up legacy statusLine reference from settings');
      delete settings.statusLine;
      needSave = true;
    }

    // Save if we cleaned up legacy reference
    if (needSave) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
        mode: 0o600,
      });
    }

    // Already configured
    if (isCurrentStatusLineHookConfigured(settings)) {
      return true;
    }

    // Backup existing config
    backupStatusLineConfig(settings.statusLine);

    // Set our status line config
    settings.statusLine = {
      type: 'command',
      command: generateStatusLineCommand(),
      padding: 0,
    };

    const configDir = getClaudeConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 });
    console.log('[ClaudeHookManager] Status line hook configured successfully');
    return true;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to configure status line hook:', error);
    return false;
  }
}

/**
 * Remove status line hook and restore original config
 */
export function removeStatusLineHook(): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();

    if (!fs.existsSync(settingsPath)) {
      return true;
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);

    // Only remove if it's our hook
    if (!isManagedStatusLineHookConfigured(settings)) {
      return true;
    }

    // Restore from backup
    const originalConfig = restoreStatusLineConfig();

    if (originalConfig === undefined) {
      // No backup, just delete our config
      delete settings.statusLine;
    } else if (originalConfig === null) {
      // Original had no config
      delete settings.statusLine;
    } else {
      // Restore original config
      settings.statusLine = originalConfig;
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { mode: 0o600 });

    // Remove script file
    const scriptPath = getStatusLineScriptPath();
    if (fs.existsSync(scriptPath)) {
      fs.unlinkSync(scriptPath);
    }

    console.log('[ClaudeHookManager] Status line hook removed successfully');
    return true;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to remove status line hook:', error);
    return false;
  }
}

/**
 * Check if status line hook is installed
 */
export function isStatusLineHookInstalled(): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return false;
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);
    return isCurrentStatusLineHookConfigured(settings);
  } catch {
    return false;
  }
}

// ============================================================================
// PermissionRequest Hook Management (for AskUserQuestion notifications)
// ============================================================================

/**
 * Check if PermissionRequest hook is configured
 */
function isPermissionRequestHookConfigured(settings: ClaudeSettings): boolean {
  return hasManagedCommandHook(settings.hooks?.PermissionRequest, [HOOK_MARKER]);
}

/**
 * Ensure PermissionRequest hook is configured
 */
export function ensurePermissionRequestHook(): boolean {
  if (!isClaudeInstalled()) {
    console.log('[ClaudeHookManager] Claude not installed, skipping PermissionRequest hook setup');
    return false;
  }

  try {
    const settingsPath = getClaudeSettingsPath();

    // Read existing settings or create new
    let settings: ClaudeSettings = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    const needSave = migrateLegacyHookGroups(settings, 'PermissionRequest');
    if (needSave) {
      console.log(
        '[ClaudeHookManager] Cleaned up legacy PermissionRequest hook references from settings'
      );
    }

    if (needSave) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
        mode: 0o600,
      });
    }

    // Check if already configured (with NEW hook marker only)
    const hasCurrentHook = hasManagedCommandHook(settings.hooks?.PermissionRequest, [HOOK_MARKER]);
    if (hasCurrentHook) {
      return true;
    }

    // Initialize hooks object if needed
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.PermissionRequest) {
      settings.hooks.PermissionRequest = [];
    }

    const hookCommand = generateHookCommand();
    settings.hooks.PermissionRequest.push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: hookCommand,
          timeout: 5,
        },
      ],
    });

    // Ensure directory exists
    const configDir = getClaudeConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    // Write settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });

    console.log('[ClaudeHookManager] PermissionRequest hook configured successfully');
    return true;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to configure PermissionRequest hook:', error);
    return false;
  }
}

/**
 * Ensure UserPromptSubmit hook is configured in Claude settings
 * This hook triggers when user submits a message to Claude
 */
export function ensureUserPromptSubmitHook(): boolean {
  if (!isClaudeInstalled()) {
    console.log('[ClaudeHookManager] Claude not installed, skipping UserPromptSubmit hook setup');
    return false;
  }

  try {
    const settingsPath = getClaudeSettingsPath();

    // Read existing settings or create new
    let settings: ClaudeSettings = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    const needSave = migrateLegacyHookGroups(settings, 'UserPromptSubmit');
    if (needSave) {
      console.log(
        '[ClaudeHookManager] Cleaned up legacy UserPromptSubmit hook references from settings'
      );
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
        mode: 0o600,
      });
    }

    const hasCurrentHook = hasManagedCommandHook(settings.hooks?.UserPromptSubmit, [HOOK_MARKER]);
    if (hasCurrentHook) {
      return true;
    }

    // Initialize hooks object if needed
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = [];
    }

    const hookCommand = generateHookCommand();
    settings.hooks.UserPromptSubmit.push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: hookCommand,
          timeout: 5,
        },
      ],
    });

    // Ensure directory exists
    const configDir = getClaudeConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    // Write settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });

    console.log('[ClaudeHookManager] UserPromptSubmit hook configured successfully');
    return true;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to configure UserPromptSubmit hook:', error);
    return false;
  }
}

/**
 * Ensure PreToolUse hook is configured in Claude settings
 * This hook triggers when Claude starts using any tool
 */
export function ensurePreToolUseHook(): boolean {
  if (!isClaudeInstalled()) {
    console.log('[ClaudeHookManager] Claude not installed, skipping PreToolUse hook setup');
    return false;
  }

  try {
    const settingsPath = getClaudeSettingsPath();

    // Read existing settings or create new
    let settings: ClaudeSettings = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    const needSave = migrateLegacyHookGroups(settings, 'PreToolUse');
    if (needSave) {
      console.log('[ClaudeHookManager] Cleaned up legacy PreToolUse hook references from settings');
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
        mode: 0o600,
      });
    }

    const hasCurrentHook = hasManagedCommandHook(settings.hooks?.PreToolUse, [HOOK_MARKER]);
    if (hasCurrentHook) {
      return true;
    }

    // Initialize hooks object if needed
    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = [];
    }

    const hookCommand = generateHookCommand();
    settings.hooks.PreToolUse.push({
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: hookCommand,
          timeout: 5,
        },
      ],
    });

    // Ensure directory exists
    const configDir = getClaudeConfigDir();
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
    }

    // Write settings
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });

    console.log('[ClaudeHookManager] PreToolUse hook configured successfully');
    return true;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to configure PreToolUse hook:', error);
    return false;
  }
}

/**
 * Remove PermissionRequest hook from Claude settings
 */
export function removePermissionRequestHook(): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();

    if (!fs.existsSync(settingsPath)) {
      return true;
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);

    if (!settings.hooks?.PermissionRequest) {
      return true;
    }

    removeManagedHookGroups(settings, 'PermissionRequest');

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), {
      mode: 0o600,
    });

    console.log('[ClaudeHookManager] PermissionRequest hook removed successfully');
    return true;
  } catch (error) {
    console.error('[ClaudeHookManager] Failed to remove PermissionRequest hook:', error);
    return false;
  }
}

/**
 * Check if PermissionRequest hook is installed
 */
export function isPermissionRequestHookInstalled(): boolean {
  try {
    const settingsPath = getClaudeSettingsPath();
    if (!fs.existsSync(settingsPath)) {
      return false;
    }

    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(content);
    return isPermissionRequestHookConfigured(settings);
  } catch {
    return false;
  }
}
