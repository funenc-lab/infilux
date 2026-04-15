import type { ClaudeGlobalPolicy, ClaudeProjectPolicy, ResolvedClaudePolicy } from '@shared/types';
import { CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_REPOSITORY_SETTINGS,
  getClaudeGlobalPolicy,
  getClaudeProjectPolicy,
  getRepositorySettings,
  type RepositorySettings,
  saveClaudeProjectPolicy,
  saveRepositorySettings,
} from '@/App/storage';
import { ClaudePolicyEditorDialog } from '@/components/settings/claude-policy';
import { ClaudePolicyPreview } from '@/components/settings/claude-policy/ClaudePolicyPreview';
import {
  getClaudePolicySummaryItems,
  hasClaudePolicyConfigChanges,
} from '@/components/settings/claude-policy/model';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { useAgentSessionsStore } from '@/stores/agentSessions';

interface RepositorySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  repoName: string;
}

export function RepositorySettingsDialog({
  open,
  onOpenChange,
  repoPath,
  repoName,
}: RepositorySettingsDialogProps) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<RepositorySettings>(DEFAULT_REPOSITORY_SETTINGS);
  const [globalPolicy, setGlobalPolicy] = useState<ClaudeGlobalPolicy | null>(null);
  const [projectPolicy, setProjectPolicy] = useState<ClaudeProjectPolicy | null>(null);
  const [projectPreview, setProjectPreview] = useState<ResolvedClaudePolicy | null>(null);
  const [policyEditorOpen, setPolicyEditorOpen] = useState(false);
  const markClaudePolicyStaleForRepo = useAgentSessionsStore((s) => s.markClaudePolicyStaleForRepo);

  useEffect(() => {
    if (open && repoPath) {
      setSettings(getRepositorySettings(repoPath));
      setGlobalPolicy(getClaudeGlobalPolicy());
      setProjectPolicy(getClaudeProjectPolicy(repoPath));
    }
  }, [open, repoPath]);

  useEffect(() => {
    if (!open || !repoPath || !window.electronAPI?.claudePolicy?.preview) {
      return;
    }

    let cancelled = false;
    window.electronAPI.claudePolicy.preview
      .resolve({
        repoPath,
        worktreePath: repoPath,
        globalPolicy,
        projectPolicy,
        worktreePolicy: null,
      })
      .then((preview) => {
        if (!cancelled) {
          setProjectPreview(preview);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProjectPreview(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [globalPolicy, open, projectPolicy, repoPath]);

  const handleSave = useCallback(() => {
    saveRepositorySettings(repoPath, settings);
    onOpenChange(false);
  }, [repoPath, settings, onOpenChange]);

  const policySummaryItems = useMemo(
    () => getClaudePolicySummaryItems(projectPolicy),
    [projectPolicy]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Repository Settings')}</DialogTitle>
          <DialogDescription>{repoName}</DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-6">
          <div className="space-y-4">
            {/* Hide Repository */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <label className="ui-type-block-title" htmlFor="hidden-switch">
                    {t('Hide Repository')}
                  </label>
                  <Tooltip>
                    <TooltipTrigger className="text-muted-foreground hover:text-foreground transition-colors">
                      <CircleHelp className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipPopup>
                      {t(
                        'Tip: Use the list button in the top-left corner to manage hidden repositories'
                      )}
                    </TooltipPopup>
                  </Tooltip>
                </div>
                <p className="ui-type-meta text-muted-foreground">
                  {t('Hidden repositories will not appear in the sidebar')}
                </p>
              </div>
              <Switch
                id="hidden-switch"
                checked={settings.hidden}
                onCheckedChange={(checked) => setSettings((prev) => ({ ...prev, hidden: checked }))}
              />
            </div>

            {/* Auto-initialize */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <label className="ui-type-block-title" htmlFor="auto-init-switch">
                  {t('Auto-initialize new worktrees')}
                </label>
                <p className="ui-type-meta text-muted-foreground">
                  {t('Automatically run init script when creating new worktrees')}
                </p>
              </div>
              <Switch
                id="auto-init-switch"
                checked={settings.autoInitWorktree}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, autoInitWorktree: checked }))
                }
              />
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="ui-type-block-title">{t('Project Skill & MCP')}</div>
                  <p className="ui-type-meta text-muted-foreground">
                    {t(
                      'Control the default skill and MCP baseline applied to Claude sessions in this repository.'
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  data-policy-action="edit-project"
                  onClick={() => setPolicyEditorOpen(true)}
                >
                  {t('Configure')}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {policySummaryItems.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-lg border border-border/70 bg-background/70 p-3"
                  >
                    <div className="ui-type-meta text-muted-foreground">{t(item.label)}</div>
                    <div className="mt-2 text-sm text-foreground">
                      {t('Enabled')} {item.allowed}
                    </div>
                    <div className="ui-type-meta text-muted-foreground">
                      {t('Disabled')} {item.blocked}
                    </div>
                  </div>
                ))}
              </div>

              {projectPreview ? (
                <ClaudePolicyPreview catalog={null} resolvedPolicy={projectPreview} />
              ) : null}
            </div>

            {settings.autoInitWorktree && (
              <div className="space-y-2">
                <label className="ui-type-block-title" htmlFor="init-script">
                  {t('Init Script')}
                </label>
                <Textarea
                  id="init-script"
                  placeholder={t('e.g., pnpm install && pnpm dev')}
                  value={settings.initScript}
                  onChange={(e) => setSettings((prev) => ({ ...prev, initScript: e.target.value }))}
                  className="ui-type-panel-description min-h-24 font-mono"
                />
                <p className="ui-type-meta text-muted-foreground">
                  {t(
                    'Commands to run after creating a new worktree. Multiple commands can be separated by && or newlines.'
                  )}
                </p>
              </div>
            )}
          </div>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button onClick={handleSave}>{t('Save')}</Button>
        </DialogFooter>

        <ClaudePolicyEditorDialog
          open={policyEditorOpen}
          onOpenChange={setPolicyEditorOpen}
          scope="project"
          globalPolicy={globalPolicy}
          repoPath={repoPath}
          repoName={repoName}
          projectPolicy={projectPolicy}
          worktreePolicy={null}
          onSave={(nextPolicy, nextPreview) => {
            const changed = hasClaudePolicyConfigChanges(projectPolicy, nextPolicy);
            saveClaudeProjectPolicy(repoPath, nextPolicy as ClaudeProjectPolicy | null);
            setProjectPolicy(nextPolicy as ClaudeProjectPolicy | null);
            setProjectPreview(nextPreview);
            if (changed) {
              markClaudePolicyStaleForRepo(repoPath);
            }
          }}
        />
      </DialogPopup>
    </Dialog>
  );
}
