const BOOTSTRAP_APP_VERSION_ARGUMENT_PREFIX = '--infilux-app-version=';

export function encodeBootstrapAppVersionArgument(appVersion: string): string {
  return `${BOOTSTRAP_APP_VERSION_ARGUMENT_PREFIX}${encodeURIComponent(appVersion)}`;
}

export function parseBootstrapAppVersionFromArgv(argv: readonly string[]): string | null {
  const encodedVersion = argv.find((entry) =>
    entry.startsWith(BOOTSTRAP_APP_VERSION_ARGUMENT_PREFIX)
  );
  if (!encodedVersion) {
    return null;
  }

  try {
    const appVersion = decodeURIComponent(
      encodedVersion.slice(BOOTSTRAP_APP_VERSION_ARGUMENT_PREFIX.length)
    ).trim();
    return appVersion.length > 0 ? appVersion : null;
  } catch {
    return null;
  }
}
