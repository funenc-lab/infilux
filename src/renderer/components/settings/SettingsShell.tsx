import { getDisplayPathBasename } from '@shared/utils/path';
import {
  Bot,
  FileCode,
  Globe,
  Keyboard,
  Link,
  Palette,
  Server,
  Settings,
  Share2,
  Sparkles,
} from 'lucide-react';
import * as React from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { AgentSettings } from './AgentSettings';
import { AISettings } from './AISettings';
import { AppearanceSettings } from './AppearanceSettings';
import type { SettingsCategory } from './constants';
import { EditorSettings } from './EditorSettings';
import { GeneralSettings } from './GeneralSettings';
import { HapiSettings } from './HapiSettings';
import { IntegrationSettings } from './IntegrationSettings';
import { KeybindingsSettings } from './KeybindingsSettings';
import { RemoteSettings } from './RemoteSettings';
import { WebInspectorSettings } from './WebInspectorSettings';

interface SettingsShellProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
  scrollToProvider?: boolean;
  repoPath?: string;
  className?: string;
  contentClassName?: string;
}

export function SettingsShell({
  activeCategory,
  onCategoryChange,
  scrollToProvider,
  repoPath,
  className,
  contentClassName,
}: SettingsShellProps) {
  const { t } = useI18n();

  const categories = React.useMemo(
    () =>
      [
        { id: 'general', icon: Settings, label: t('General') },
        { id: 'appearance', icon: Palette, label: t('Appearance') },
        { id: 'editor', icon: FileCode, label: t('Editor') },
        { id: 'keybindings', icon: Keyboard, label: t('Keybindings') },
        { id: 'agent', icon: Bot, label: t('Agent') },
        { id: 'ai', icon: Sparkles, label: t('AI') },
        { id: 'integration', icon: Link, label: t('Claude Integration') },
        { id: 'hapi', icon: Share2, label: t('Remote Sharing') },
        { id: 'remote', icon: Server, label: t('Remote Connection') },
        { id: 'webInspector', icon: Globe, label: t('Web Inspector') },
      ] satisfies Array<{ id: SettingsCategory; icon: React.ElementType; label: string }>,
    [t]
  );

  const activeMeta = categories.find((category) => category.id === activeCategory) ?? categories[0];
  const repoLabel = repoPath ? getDisplayPathBasename(repoPath) : null;

  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col lg:flex-row', className)}>
      <aside className="control-sidebar flex w-full shrink-0 flex-col border-b bg-background lg:w-56 lg:border-r lg:border-b-0">
        <div className="px-4 pt-4 pb-2">
          <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t('Settings')}
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm font-medium text-foreground">
            <activeMeta.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{activeMeta.label}</span>
          </div>
          {repoLabel ? <div className="mt-1 text-xs text-muted-foreground">{repoLabel}</div> : null}
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:px-3 lg:pb-4">
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={cn(
                'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors lg:w-full',
                activeCategory === category.id
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground'
              )}
            >
              <category.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{category.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className={cn('min-w-0 flex-1 overflow-y-auto p-4 sm:p-5 md:p-6', contentClassName)}>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-border/70 pb-4">
          <div className="min-w-0">
            <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t('Configuration')}
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <activeMeta.icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{activeMeta.label}</span>
            </div>
          </div>
          {repoLabel ? <div className="text-xs text-muted-foreground">{repoLabel}</div> : null}
        </div>

        {activeCategory === 'general' && <GeneralSettings />}
        {activeCategory === 'appearance' && <AppearanceSettings />}
        {activeCategory === 'editor' && <EditorSettings />}
        {activeCategory === 'keybindings' && <KeybindingsSettings />}
        {activeCategory === 'agent' && <AgentSettings repoPath={repoPath} />}
        {activeCategory === 'ai' && <AISettings />}
        {activeCategory === 'integration' && (
          <IntegrationSettings repoPath={repoPath} scrollToProvider={scrollToProvider} />
        )}
        {activeCategory === 'hapi' && <HapiSettings repoPath={repoPath} />}
        {activeCategory === 'remote' && <RemoteSettings />}
        {activeCategory === 'webInspector' && <WebInspectorSettings />}
      </div>
    </div>
  );
}
