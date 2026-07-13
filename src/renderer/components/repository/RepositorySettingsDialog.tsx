import type { ClaudeGlobalPolicy, ClaudeProjectPolicy, ResolvedClaudePolicy } from '@shared/types';
import { CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_REPOSITORY_SETTINGS,
  getClaudeGlobalPolicy,
  getClaudeProjectPolicy,
  getProjectConfigSchemeSelection,
  getRepositorySettings,
  type RepositorySettings,
  saveClaudeProjectPolicy,
  saveRepositorySettings,
} from '@/App/storage';
import { ClaudePolicyEditorDialog } from '@/components/settings/claude-policy';
import {
  getClaudePolicySummaryItems,
  hasClaudePolicyConfigChanges,
  isLegacySkillCapabilityId,
} from '@/components/settings/claude-policy/model';
import { resolveProjectConfigSchemePreviewPolicies } from '@/components/settings/claude-policy/projectConfigSchemePreview';
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
import { useSettingsStore } from '@/stores/settings';

interface RepositorySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  repoName: string;
}

interface PolicyAccessSummaryItem {
  key: string;
  label: string;
  allowed: number;
  blocked: number;
}

function getEffectivePolicySummaryItems(
  projectPreview: ResolvedClaudePolicy | null
): PolicyAccessSummaryItem[] {
  const allowedSkillIds =
    projectPreview?.allowedCapabilityIds.filter(isLegacySkillCapabilityId) ?? [];
  const blockedSkillIds =
    projectPreview?.blockedCapabilityIds.filter(isLegacySkillCapabilityId) ?? [];

  return [
    {
      key: 'skills',
      label: 'Skills',
      allowed: allowedSkillIds.length,
      blocked: blockedSkillIds.length,
    },
    {
      key: 'shared-mcp',
      label: 'Shared MCP',
      allowed: projectPreview?.allowedSharedMcpIds.length ?? 0,
      blocked: projectPreview?.blockedSharedMcpIds.length ?? 0,
    },
    {
      key: 'personal-mcp',
      label: 'Personal MCP',
      allowed: projectPreview?.allowedPersonalMcpIds.length ?? 0,
      blocked: projectPreview?.blockedPersonalMcpIds.length ?? 0,
    },
  ];
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
  const [selectedProjectSchemeId, setSelectedProjectSchemeId] = useState<string | null>(null);
  const markClaudePolicyStaleForRepo = useAgentSessionsStore((s) => s.markClaudePolicyStaleForRepo);
  const projectConfigSchemes = useSettingsStore((s) => s.projectConfigSchemes);

  useEffect(() => {
    if (open && repoPath) {
      setSettings(getRepositorySettings(repoPath));
      setGlobalPolicy(getClaudeGlobalPolicy());
      setProjectPolicy(getClaudeProjectPolicy(repoPath));
      setSelectedProjectSchemeId(getProjectConfigSchemeSelection(repoPath)?.schemeId ?? null);
    }
  }, [open, repoPath]);

  useEffect(() => {
    if (!open || !repoPath || !window.electronAPI?.claudePolicy?.preview) {
      return;
    }

    let cancelled = false;
    const schemePolicies = resolveProjectConfigSchemePreviewPolicies({
      repoPath,
      worktreePath: repoPath,
      schemes: projectConfigSchemes,
      repositorySchemeId: selectedProjectSchemeId,
      worktreeSchemeId: null,
      projectPolicy,
      worktreePolicy: null,
    });

    window.electronAPI.claudePolicy.preview
      .resolve({
        repoPath,
        worktreePath: repoPath,
        globalPolicy,
        projectPolicy: schemePolicies.projectPolicy,
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
  }, [globalPolicy, open, projectConfigSchemes, projectPolicy, repoPath, selectedProjectSchemeId]);

  const handleSave = useCallback(() => {
    saveRepositorySettings(repoPath, settings);
    onOpenChange(false);
  }, [repoPath, settings, onOpenChange]);

  const policySummaryItems = useMemo(
    () => getClaudePolicySummaryItems(projectPolicy),
    [projectPolicy]
  );
  const effectivePolicySummaryItems = useMemo(
    () => getEffectivePolicySummaryItems(projectPreview),
    [projectPreview]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
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

            <div className="space-y-4 rounded-xl border border-border/70 bg-background/60 p-4">
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

              <div className="grid gap-2 sm:grid-cols-3" data-policy-config-summary="project">
                {policySummaryItems.map((item) => (
                  <div key={item.key} className="min-w-0 rounded-lg bg-muted/30 px-3 py-2">
                    <div className="ui-type-meta text-muted-foreground">{t(item.label)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span>
                        {t('Enabled')} {item.allowed}
                      </span>
                      <span className="text-muted-foreground">
                        {t('Disabled')} {item.blocked}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div
                className="space-y-3 rounded-lg bg-muted/20 px-3 py-3"
                data-policy-effective-summary="project"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <div className="ui-type-block-title">{t('Effective Access')}</div>
                  {!projectPreview ? (
                    <div className="ui-type-meta text-muted-foreground">
                      {t('Resolving the latest preview...')}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {effectivePolicySummaryItems.map((item) => (
                    <div key={item.key} className="min-w-0">
                      <div className="ui-type-meta text-muted-foreground">{t(item.label)}</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">
                        {item.allowed}
                      </div>
                      <div className="ui-type-meta text-muted-foreground">
                        {t('{{count}} blocked', { count: item.blocked })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
          onConfigSchemeSelectionChange={() => {
            setSelectedProjectSchemeId(getProjectConfigSchemeSelection(repoPath)?.schemeId ?? null);
            markClaudePolicyStaleForRepo(repoPath);
          }}
        />
      </DialogPopup>
    </Dialog>
  );
}
