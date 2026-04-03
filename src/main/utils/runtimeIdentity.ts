import {
  type AppRuntimeChannel,
  buildAppRuntimeIdentity,
  resolveAppRuntimeChannel,
} from '@shared/utils/runtimeIdentity';

export function getAppRuntimeChannel(): AppRuntimeChannel {
  return resolveAppRuntimeChannel({
    explicitChannel: process.env.INFILUX_RUNTIME_CHANNEL,
    nodeEnv: process.env.NODE_ENV,
    vitest: process.env.VITEST,
  });
}

export function getAppRuntimeIdentity() {
  return buildAppRuntimeIdentity(getAppRuntimeChannel());
}
