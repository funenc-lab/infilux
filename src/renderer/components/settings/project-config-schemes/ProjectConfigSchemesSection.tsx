import type { ClaudeGlobalPolicy, ProjectConfigScheme } from '@shared/types';
import { Edit2, Plus, Settings2, Trash2 } from 'lucide-react';
import * as React from 'react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { ClaudePolicyEditorDialog } from '../claude-policy';
import { createClaudePolicyDraft, hasClaudePolicyConfigChanges } from '../claude-policy/model';
import { ProjectConfigSchemeDialog } from './ProjectConfigSchemeDialog';

interface ProjectConfigSchemesSectionProps {
  repoPath?: string;
}

export function ProjectConfigSchemesSection({ repoPath }: ProjectConfigSchemesSectionProps) {
  const { t } = useI18n();
  const projectConfigSchemes = useSettingsStore((state) => state.projectConfigSchemes);
  const promptPresets = useSettingsStore((state) => state.promptPresets);
  const addProjectConfigScheme = useSettingsStore((state) => state.addProjectConfigScheme);
  const updateProjectConfigScheme = useSettingsStore((state) => state.updateProjectConfigScheme);
  const removeProjectConfigScheme = useSettingsStore((state) => state.removeProjectConfigScheme);
  const markClaudePolicyStaleGlobally = useAgentSessionsStore(
    (state) => state.markClaudePolicyStaleGlobally
  );
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingScheme, setEditingScheme] = React.useState<ProjectConfigScheme | null>(null);
  const [policyScheme, setPolicyScheme] = React.useState<ProjectConfigScheme | null>(null);
  const [deleteSchemeCandidate, setDeleteSchemeCandidate] =
    React.useState<ProjectConfigScheme | null>(null);

  const handleAdd = () => {
    setEditingScheme(null);
    setDialogOpen(true);
  };

  const handleEdit = (scheme: ProjectConfigScheme) => {
    setEditingScheme(scheme);
    setDialogOpen(true);
  };

  const handleSave = (scheme: ProjectConfigScheme) => {
    const exists = projectConfigSchemes.some((item) => item.id === scheme.id);
    if (exists) {
      updateProjectConfigScheme(scheme.id, scheme);
    } else {
      addProjectConfigScheme(scheme);
    }
    markClaudePolicyStaleGlobally();
    setDialogOpen(false);
    toastManager.add({
      type: 'success',
      title: t('Project scheme saved'),
      description: t('Future sessions will use the updated scheme selection.'),
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteSchemeCandidate) {
      return;
    }

    const scheme = deleteSchemeCandidate;
    removeProjectConfigScheme(scheme.id);
    markClaudePolicyStaleGlobally();
    setDeleteSchemeCandidate(null);
    toastManager.add({
      type: 'success',
      title: t('Project scheme removed'),
      description: t('Repositories and worktrees selecting this scheme will inherit defaults.'),
    });
  };

  const getPromptName = (scheme: ProjectConfigScheme): string => {
    if (!scheme.promptPresetId) {
      return t('No prompt preset');
    }

    return (
      promptPresets.find((preset) => preset.id === scheme.promptPresetId)?.name ??
      t('Missing prompt preset')
    );
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h3 className="text-lg font-medium">{t('Project Schemes')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('Create reusable templates for skill, MCP, and prompt settings.')}
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="mr-2 h-4 w-4" />
          {t('Add Scheme')}
        </Button>
      </div>

      {projectConfigSchemes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-5 text-sm text-muted-foreground">
          {t('No project schemes configured')}
        </div>
      ) : (
        <div className="space-y-3">
          {projectConfigSchemes.map((scheme) => (
            <div
              key={scheme.id}
              className="rounded-xl border border-border/70 bg-background/50 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-sm font-medium">{scheme.name}</div>
                  {scheme.description ? (
                    <p className="text-xs text-muted-foreground">{scheme.description}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t('Prompt')}: {getPromptName(scheme)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPolicyScheme(scheme)}>
                    <Settings2 className="mr-2 h-4 w-4" />
                    {t('Skill & MCP')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('Edit project scheme')}
                    onClick={() => handleEdit(scheme)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('Delete project scheme')}
                    onClick={() => setDeleteSchemeCandidate(scheme)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ProjectConfigSchemeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        scheme={editingScheme}
        promptPresets={promptPresets}
        onSave={handleSave}
      />

      {policyScheme ? (
        <ClaudePolicyEditorDialog
          open={Boolean(policyScheme)}
          onOpenChange={(open) => {
            if (!open) {
              setPolicyScheme(null);
            }
          }}
          scope="global"
          globalPolicy={policyScheme.claudePolicy as ClaudeGlobalPolicy}
          repoPath={repoPath ?? ''}
          repoName={policyScheme.name}
          title={t('Project Scheme Skill & MCP')}
          description={policyScheme.name}
          saveSuccessDescription={t('Project scheme skill and MCP settings were saved.')}
          projectPolicy={null}
          worktreePolicy={null}
          onSave={(nextPolicy) => {
            const normalizedPolicy = createClaudePolicyDraft(nextPolicy);
            const changed = hasClaudePolicyConfigChanges(
              policyScheme.claudePolicy,
              normalizedPolicy
            );
            updateProjectConfigScheme(policyScheme.id, {
              claudePolicy: normalizedPolicy,
            });
            if (changed) {
              markClaudePolicyStaleGlobally();
            }
          }}
        />
      ) : null}

      <AlertDialog
        open={Boolean(deleteSchemeCandidate)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteSchemeCandidate(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete project scheme')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Repositories and worktrees using this scheme will fall back to their direct policy settings.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
            <Button variant="destructive" onClick={handleConfirmDelete}>
              {t('Delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </section>
  );
}
