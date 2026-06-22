import { AppCategory, type DetectedApp } from '@shared/types';
import { ChevronDown, FileCode, FolderOpen, Terminal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import type { TabId } from '@/App/constants';
import { Select, SelectItem, SelectPopup, SelectTrigger } from '@/components/ui/select';
import { useDetectedApps, useOpenWith } from '@/hooks/useAppDetector';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';

function AppIcon({
  bundleId,
  name,
  fallback: Fallback,
}: {
  bundleId: string;
  name: string;
  fallback: React.ElementType;
}) {
  const [icon, setIcon] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.appDetector.getIcon(bundleId).then((dataUrl) => {
      if (dataUrl) setIcon(dataUrl);
    });
  }, [bundleId]);

  if (icon) {
    return <img src={icon} alt={name} className="size-5" />;
  }
  return <Fallback className="size-5" />;
}
interface OpenInMenuProps {
  path?: string;
  activeTab?: TabId;
  compact?: boolean;
}

export function OpenInMenu({ path, activeTab, compact = false }: OpenInMenuProps) {
  const { t } = useI18n();
  const { data: apps = [], isLoading } = useDetectedApps();
  const openWith = useOpenWith();
  const [lastUsedApp, setLastUsedApp] = useState<string>('');
  const { activeTabPath, tabs, currentCursorLine } = useEditorStore(
    useShallow((state) => ({
      activeTabPath: state.activeTabPath,
      tabs: state.tabs,
      currentCursorLine: state.currentCursorLine,
    }))
  );
  const isRemotePath = path?.startsWith('/__enso_remote__/') ?? false;
  const hiddenOpenInApps = useSettingsStore((s) => s.hiddenOpenInApps);
  const openInMenuFilterEnabled = useSettingsStore((s) => s.openInMenuFilterEnabled);
  const hiddenSet = useMemo(() => new Set(hiddenOpenInApps), [hiddenOpenInApps]);
  const visibleApps = openInMenuFilterEnabled
    ? apps.filter((app) => !hiddenSet.has(app.bundleId))
    : apps;

  useEffect(() => {
    const saved = localStorage.getItem('enso-last-opened-app');
    if (saved) {
      setLastUsedApp(saved);
    }
  }, []);

  const handleOpen = async (bundleId: string | null) => {
    if (!bundleId || !path) return;

    setLastUsedApp(bundleId);
    localStorage.setItem('enso-last-opened-app', bundleId);

    // If in file editor tab and files are open, sync all open files
    if (activeTab === 'file' && tabs.length > 0) {
      const openFiles = tabs.map((tab) => tab.path);
      await openWith.mutateAsync({
        path,
        bundleId,
        options: {
          workspacePath: path,
          openFiles,
          activeFile: activeTabPath || undefined,
          line: currentCursorLine || undefined,
        },
      });
    } else {
      // Otherwise just open the directory/path
      await openWith.mutateAsync({ path, bundleId });
    }
  };

  const handleQuickOpen = () => {
    handleOpen(defaultApp.bundleId);
  };

  const actionClassName = compact
    ? 'control-floating-toolbar-action'
    : 'control-topbar-action h-8 gap-1.5 rounded-lg px-2.5';
  const openInLabel = t('Open in app');

  if (isLoading) {
    return (
      <div className={actionClassName} title={t('Loading apps')}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span className={compact ? 'sr-only' : undefined}>Loading...</span>
      </div>
    );
  }

  if (visibleApps.length === 0) {
    return (
      <div className={actionClassName} title={t('No apps')}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span className={compact ? 'sr-only' : undefined}>No Apps</span>
      </div>
    );
  }

  if (!path || isRemotePath) {
    const disabledLabel = isRemotePath ? 'Remote Only' : 'Quick Open';
    return (
      <div className={cn(actionClassName, 'opacity-50')} title={disabledLabel}>
        <FolderOpen className="h-3.5 w-3.5" />
        <span className={compact ? 'sr-only' : undefined}>{disabledLabel}</span>
      </div>
    );
  }

  const lastApp = visibleApps.find((app) => app.bundleId === lastUsedApp);
  const defaultApp =
    lastApp || visibleApps.find((app) => app.category === 'finder') || visibleApps[0];
  const groupedApps = groupAppsByCategory(visibleApps);

  // Determine what we're opening
  const isOpeningFile = activeTab === 'file' && activeTabPath;
  const displayIcon = isOpeningFile ? FileCode : FolderOpen;

  const appMenuOptions = (
    <>
      {/* Finder */}
      {groupedApps.finder.length > 0 && (
        <>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {t('File Manager')}
          </div>
          {groupedApps.finder.map((app) => (
            <SelectItem key={app.bundleId} value={app.bundleId}>
              <div className="flex items-center gap-2">
                <AppIcon bundleId={app.bundleId} name={app.name} fallback={FolderOpen} />
                <span>{app.name}</span>
              </div>
            </SelectItem>
          ))}
        </>
      )}

      {/* Terminals */}
      {groupedApps.terminal.length > 0 && (
        <>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {t('Terminals')}
          </div>
          {groupedApps.terminal.map((app) => (
            <SelectItem key={app.bundleId} value={app.bundleId}>
              <div className="flex items-center gap-2">
                <AppIcon bundleId={app.bundleId} name={app.name} fallback={Terminal} />
                <span>{app.name}</span>
              </div>
            </SelectItem>
          ))}
        </>
      )}

      {/* Editors */}
      {groupedApps.editor.length > 0 && (
        <>
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {t('Editors')}
          </div>
          {groupedApps.editor.map((app) => (
            <SelectItem key={app.bundleId} value={app.bundleId}>
              <div className="flex items-center gap-2">
                <AppIcon bundleId={app.bundleId} name={app.name} fallback={FileCode} />
                <span>{app.name}</span>
              </div>
            </SelectItem>
          ))}
        </>
      )}
    </>
  );

  if (compact) {
    return (
      <Select value="" onValueChange={handleOpen}>
        <SelectTrigger
          className={cn(
            actionClassName,
            'hover:bg-muted/40 data-[state=open]:bg-muted/40 focus-visible:border-0 focus-visible:ring-0',
            '[&_[data-slot=select-icon]]:hidden'
          )}
          aria-label={openInLabel}
          title={`${openInLabel}: ${defaultApp.name}`}
        >
          <AppIcon bundleId={defaultApp.bundleId} name={defaultApp.name} fallback={displayIcon} />
        </SelectTrigger>
        <SelectPopup>{appMenuOptions}</SelectPopup>
      </Select>
    );
  }

  return (
    <div className="control-topbar-action h-8 rounded-lg border-0 p-0" title={openInLabel}>
      <button
        type="button"
        onClick={handleQuickOpen}
        className="flex h-full min-w-0 items-center gap-1.5 rounded-l-lg px-2.5 transition-colors hover:bg-muted/40"
        aria-label={`${openInLabel}: ${defaultApp.name}`}
        title={`${openInLabel}: ${defaultApp.name}`}
      >
        <AppIcon bundleId={defaultApp.bundleId} name={defaultApp.name} fallback={displayIcon} />
        <span className="max-w-28 truncate">{defaultApp.name}</span>
      </button>

      <Select value="" onValueChange={handleOpen}>
        <SelectTrigger
          className={cn(
            'h-full min-h-0 w-6 min-w-0 gap-0 rounded-r-lg border-0 bg-transparent p-0 px-1 shadow-none ring-0',
            'hover:bg-muted/40 data-[state=open]:bg-muted/40 focus-visible:border-0 focus-visible:ring-0',
            '[&_[data-slot=select-icon]]:hidden'
          )}
          aria-label={t('Choose app')}
          title={t('Choose app')}
        >
          <ChevronDown className="h-3 w-3" />
        </SelectTrigger>
        <SelectPopup>{appMenuOptions}</SelectPopup>
      </Select>
    </div>
  );
}

function groupAppsByCategory(apps: DetectedApp[]): Record<AppCategory, DetectedApp[]> {
  const grouped: Record<AppCategory, DetectedApp[]> = {
    [AppCategory.Finder]: [],
    [AppCategory.Terminal]: [],
    [AppCategory.Editor]: [],
  };

  for (const app of apps) {
    if (grouped[app.category]) {
      grouped[app.category].push(app);
    }
  }

  return grouped;
}
