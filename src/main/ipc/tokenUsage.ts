import type { GetProjectTokenUsageRequest, ProjectTokenUsageUpdatedEvent } from '@shared/types';
import { IPC_CHANNELS } from '@shared/types';
import { ipcMain, type WebContents } from 'electron';
import { tokenUsageService } from '../services/tokenUsage';

export function registerTokenUsageHandlers(): void {
  const subscriptions = new Map<
    WebContents,
    {
      destroyListener: () => void;
      unsubscribe: () => void;
    }
  >();

  function removeSubscription(sender: WebContents): void {
    const subscription = subscriptions.get(sender);
    if (!subscription) {
      return;
    }

    subscriptions.delete(sender);
    sender.off('destroyed', subscription.destroyListener);
    subscription.unsubscribe();
  }

  ipcMain.handle(
    IPC_CHANNELS.TOKEN_USAGE_PROJECTS_GET,
    async (_, request?: GetProjectTokenUsageRequest) => {
      return tokenUsageService.getProjectUsage(request ?? {});
    }
  );

  ipcMain.handle(IPC_CHANNELS.TOKEN_USAGE_PROJECTS_SUBSCRIBE, async (event) => {
    const sender = event.sender;
    if (subscriptions.has(sender)) {
      return true;
    }

    const unsubscribe = tokenUsageService.onProjectUsageUpdated(
      (usageEvent: ProjectTokenUsageUpdatedEvent) => {
        if (sender.isDestroyed()) {
          removeSubscription(sender);
          return;
        }

        sender.send(IPC_CHANNELS.TOKEN_USAGE_PROJECTS_UPDATED, usageEvent);
      }
    );
    const destroyListener = () => removeSubscription(sender);
    sender.once('destroyed', destroyListener);
    subscriptions.set(sender, {
      destroyListener,
      unsubscribe,
    });
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.TOKEN_USAGE_PROJECTS_UNSUBSCRIBE, async (event) => {
    removeSubscription(event.sender);
    return true;
  });
}
