export type AppRuntimeChannel = 'prod' | 'dev' | 'test';

export interface AppRuntimeIdentity {
  channel: AppRuntimeChannel;
  tmuxServerName: string;
  persistentAgentHostSessionPrefix: string;
  persistentAgentSessionDatabaseFilename: string;
}

export const APP_RUNTIME_NAMESPACE = 'infilux';

interface ResolveAppRuntimeChannelOptions {
  explicitChannel?: unknown;
  nodeEnv?: string | null;
  vitest?: string | boolean | null;
  isPackaged?: boolean | null;
}

const VALID_RUNTIME_CHANNELS = new Set<AppRuntimeChannel>(['prod', 'dev', 'test']);
const RUNTIME_CHANNEL_ARGUMENT_PREFIX = '--infilux-runtime-channel=';
const SESSION_RUNTIME_NAMESPACE = APP_RUNTIME_NAMESPACE;
const PERSISTENT_AGENT_SESSION_DATABASE_BASENAME = 'persistent-agent-sessions';

function normalizeRuntimeChannel(value: unknown): AppRuntimeChannel | null {
  return typeof value === 'string' && VALID_RUNTIME_CHANNELS.has(value as AppRuntimeChannel)
    ? (value as AppRuntimeChannel)
    : null;
}

export function encodeRuntimeChannelArgument(channel: AppRuntimeChannel): string {
  return `${RUNTIME_CHANNEL_ARGUMENT_PREFIX}${channel}`;
}

export function parseRuntimeChannelFromArgv(argv: readonly string[]): AppRuntimeChannel | null {
  const encodedChannel = argv.find((entry) => entry.startsWith(RUNTIME_CHANNEL_ARGUMENT_PREFIX));
  if (!encodedChannel) {
    return null;
  }

  return normalizeRuntimeChannel(
    decodeURIComponent(encodedChannel.slice(RUNTIME_CHANNEL_ARGUMENT_PREFIX.length))
  );
}

export function resolveAppRuntimeChannel({
  explicitChannel,
  nodeEnv,
  vitest,
  isPackaged,
}: ResolveAppRuntimeChannelOptions): AppRuntimeChannel {
  const normalizedExplicitChannel = normalizeRuntimeChannel(explicitChannel);
  if (normalizedExplicitChannel) {
    return normalizedExplicitChannel;
  }

  if (vitest === true || vitest === 'true' || nodeEnv === 'test') {
    return 'test';
  }

  if (isPackaged === true) {
    return 'prod';
  }

  if (isPackaged === false) {
    return 'dev';
  }

  return 'prod';
}

export function buildAppRuntimeIdentity(channel: AppRuntimeChannel): AppRuntimeIdentity {
  const suffix = channel === 'prod' ? '' : `-${channel}`;

  return {
    channel,
    tmuxServerName: `${SESSION_RUNTIME_NAMESPACE}${suffix}`,
    persistentAgentHostSessionPrefix: `${SESSION_RUNTIME_NAMESPACE}${suffix}`,
    persistentAgentSessionDatabaseFilename:
      channel === 'prod'
        ? `${PERSISTENT_AGENT_SESSION_DATABASE_BASENAME}.db`
        : `${PERSISTENT_AGENT_SESSION_DATABASE_BASENAME}-${channel}.db`,
  };
}

export function buildPersistentAgentHostSessionKey(
  uiSessionId: string,
  channel: AppRuntimeChannel
): string {
  const { persistentAgentHostSessionPrefix } = buildAppRuntimeIdentity(channel);
  return `${persistentAgentHostSessionPrefix}-${uiSessionId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}
