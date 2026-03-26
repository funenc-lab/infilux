export const RUNTIME_STATE_DIRNAME = '.infilux';
export const LEGACY_RUNTIME_STATE_DIRNAME = '.ensoai';

export const DEFAULT_WORKSPACE_ROOT_DIRNAME = 'infilux';
export const DEFAULT_REPOSITORIES_DIRNAME = 'repos';
export const DEFAULT_WORKTREES_DIRNAME = 'workspaces';
export const DEFAULT_TEMPORARY_DIRNAME = 'temporary';

export const TEMP_INPUT_DIRNAME = 'infilux-input';
export const TEMP_INPUT_FILE_PREFIX = 'infilux-input';
export const TEMP_PERMISSION_FILE_PREFIX = '.infilux-permission-';

export const REMOTE_AUTH_DIRNAME = 'remote-auth';
export const REMOTE_RUNTIME_DIRNAME = 'remote-runtime';
export const REMOTE_HELPER_DIRNAME = 'remote-helper';

export const SETTINGS_FILENAME = 'settings.json';
export const SESSION_STATE_FILENAME = 'session-state.json';

export const LOG_FILE_PREFIX = 'infilux-';
export const CLAUDE_COMPLETIONS_CACHE_FILENAME = 'infilux-slash-learned.json';

export const REMOTE_RUNTIME_INSTALL_SUBPATH = `${RUNTIME_STATE_DIRNAME}/${REMOTE_RUNTIME_DIRNAME}`;
export const REMOTE_SETTINGS_SUBPATH = `${RUNTIME_STATE_DIRNAME}/${SETTINGS_FILENAME}`;
export const REMOTE_SESSION_STATE_SUBPATH = `${RUNTIME_STATE_DIRNAME}/${SESSION_STATE_FILENAME}`;

export const LEGACY_SETTINGS_IMPORT_PATH_EXAMPLES = [
  `~/${LEGACY_RUNTIME_STATE_DIRNAME}/${SETTINGS_FILENAME}`,
  `%USERPROFILE%\\${LEGACY_RUNTIME_STATE_DIRNAME}\\${SETTINGS_FILENAME}`,
];

export const REMOTE_HELPER_INSTALL_EXAMPLE = `~/${RUNTIME_STATE_DIRNAME}/${REMOTE_HELPER_DIRNAME}`;
export const REMOTE_RUNTIME_INSTALL_EXAMPLE = `~/${RUNTIME_STATE_DIRNAME}/${REMOTE_RUNTIME_DIRNAME}`;
