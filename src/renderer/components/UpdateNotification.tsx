import type { UpdateStatus } from '@shared/types';
import { Download, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { Button } from './ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from './ui/dialog';

interface UpdateNotificationProps {
  autoUpdateEnabled: boolean;
}

export function UpdateNotification({ autoUpdateEnabled }: UpdateNotificationProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [availableDialogOpen, setAvailableDialogOpen] = useState(false);

  const applyStatus = useCallback(
    (nextStatus: UpdateStatus | null) => {
      setStatus(nextStatus);

      if (!nextStatus) {
        return;
      }

      if (nextStatus.status === 'downloaded') {
        setAvailableDialogOpen(false);
        setDialogOpen(true);
        return;
      }

      if (nextStatus.status === 'available' && !autoUpdateEnabled) {
        setAvailableDialogOpen(true);
        return;
      }

      if (nextStatus.status !== 'available') {
        setAvailableDialogOpen(false);
      }
    },
    [autoUpdateEnabled]
  );

  useEffect(() => {
    let cancelled = false;

    void window.electronAPI.updater
      .getState()
      .then((state) => {
        if (cancelled) {
          return;
        }
        applyStatus(state.status);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        console.error('[UpdateNotification] Failed to read updater state:', error);
      });

    const cleanup = window.electronAPI.updater.onStatus((nextStatus) => {
      if (cancelled) {
        return;
      }
      applyStatus(nextStatus);
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [applyStatus]);

  useEffect(() => {
    if (autoUpdateEnabled && status?.status === 'available') {
      setAvailableDialogOpen(false);
    }
  }, [autoUpdateEnabled, status?.status]);

  const handleInstall = useCallback(() => {
    window.electronAPI.updater.quitAndInstall();
  }, []);

  const handleLater = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDownloadNow = useCallback(() => {
    window.electronAPI.updater.downloadUpdate();
    setAvailableDialogOpen(false);
  }, []);

  const handleCancel = useCallback(() => {
    setAvailableDialogOpen(false);
  }, []);

  // Format bytes to human readable
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (status?.status === 'downloading' && status.progress) {
    return (
      <div className="control-floating fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-lg px-3 py-2">
        <Download className="h-4 w-4 animate-pulse text-primary" />
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{t('Downloading update')}</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${status.progress.percent}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {formatBytes(status.progress.bytesPerSecond)}/s
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (availableDialogOpen && status?.status === 'available') {
    return (
      <Dialog open={availableDialogOpen} onOpenChange={setAvailableDialogOpen}>
        <DialogPopup className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              {t('New version available')}
            </DialogTitle>
            <DialogDescription>
              {t('Version {{version}} is available. Do you want to download and update now?', {
                version: status?.info?.version || '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter variant="bare">
            <Button variant="outline" onClick={handleCancel}>
              {t('Cancel')}
            </Button>
            <Button onClick={handleDownloadNow}>{t('Update now')}</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    );
  }

  if (status?.status !== 'downloaded') {
    return null;
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogPopup className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            {t('Update ready')}
          </DialogTitle>
          <DialogDescription>
            {t('Version {{version}} has been downloaded. Restart now to install?', {
              version: status?.info?.version || '',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={handleLater}>
            {t('Later')}
          </Button>
          <Button onClick={handleInstall}>{t('Restart now')}</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
