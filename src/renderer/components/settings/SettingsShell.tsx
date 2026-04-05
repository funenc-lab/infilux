import { getDisplayPathBasename } from '@shared/utils/path';
import {
  Bot,
  FileCode,
  Globe,
  Keyboard,
  Link,
  Palette,
  Paperclip,
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
import { InputSettings } from './InputSettings';
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
        { id: 'input', icon: Paperclip, label: t('Advanced Features') },
        { id: 'integration', icon: Link, label: t('Claude Integration') },
        { id: 'hapi', icon: Share2, label: t('Remote Sharing') },
        { id: 'remote', icon: Server, label: t('Remote Connection') },
        { id: 'webInspector', icon: Globe, label: t('Web Inspector') },
      ] satisfies Array<{ id: SettingsCategory; icon: React.ElementType; label: string }>,
    [t]
  );

  const repoLabel = repoPath ? getDisplayPathBasename(repoPath) : null;
  const hasSidebarContext = Boolean(repoLabel);

  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col lg:flex-row', className)}>
      <aside className="control-sidebar flex w-full shrink-0 flex-col border-b lg:w-60 lg:border-r lg:border-b-0">
        {hasSidebarContext ? (
          <div className="border-b border-[color:color-mix(in_oklch,var(--border)_68%,transparent)] px-4 py-4">
            <div className="text-xs text-muted-foreground">{repoLabel}</div>
          </div>
        ) : null}

        <nav
          className={cn(
            'flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto',
            hasSidebarContext ? 'py-3 lg:py-4' : 'py-4'
          )}
        >
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={cn(
                'group relative flex shrink-0 items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm transition-colors lg:w-full',
                activeCategory === category.id
                  ? 'bg-accent/45 text-foreground'
                  : 'text-muted-foreground hover:bg-accent/24 hover:text-foreground'
              )}
            >
              <span
                className={cn(
                  'absolute left-1.5 top-2 bottom-2 w-0.5 rounded-full transition-opacity',
                  activeCategory === category.id ? 'bg-primary opacity-100' : 'bg-border opacity-0'
                )}
              />
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                  activeCategory === category.id
                    ? 'text-foreground'
                    : 'text-muted-foreground group-hover:text-foreground'
                )}
              >
                <category.icon className="h-4 w-4 shrink-0" />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{category.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className={cn('min-w-0 flex-1 overflow-y-auto p-4 sm:p-5 md:p-6', contentClassName)}>
        {activeCategory === 'general' && <GeneralSettings />}
        {activeCategory === 'appearance' && <AppearanceSettings />}
        {activeCategory === 'editor' && <EditorSettings />}
        {activeCategory === 'keybindings' && <KeybindingsSettings />}
        {activeCategory === 'agent' && <AgentSettings repoPath={repoPath} />}
        {activeCategory === 'ai' && <AISettings />}
        {activeCategory === 'input' && <InputSettings />}
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
