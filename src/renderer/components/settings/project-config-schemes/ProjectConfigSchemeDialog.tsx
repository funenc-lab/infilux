import type {
  ProjectConfigScheme,
  ProjectConfigSchemeWorktreeInitialization,
  PromptPreset,
} from '@shared/types';
import {
  createDefaultProjectConfigSchemeWorktreeInitialization,
  createEmptyProjectConfigSchemePolicy,
} from '@shared/types';
import * as React from 'react';
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n';
import { Z_INDEX } from '@/lib/z-index';

interface ProjectConfigSchemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheme: ProjectConfigScheme | null;
  promptPresets: PromptPreset[];
  onSave: (scheme: ProjectConfigScheme) => void;
}

const NO_PROMPT_VALUE = '__none__';

export function ProjectConfigSchemeDialog({
  open,
  onOpenChange,
  scheme,
  promptPresets,
  onSave,
}: ProjectConfigSchemeDialogProps) {
  const { t } = useI18n();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [promptPresetId, setPromptPresetId] = React.useState<string | null>(null);
  const [worktreeInitialization, setWorktreeInitialization] =
    React.useState<ProjectConfigSchemeWorktreeInitialization>(
      createDefaultProjectConfigSchemeWorktreeInitialization
    );
  const isEditing = Boolean(scheme);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setName(scheme?.name ?? '');
    setDescription(scheme?.description ?? '');
    setPromptPresetId(scheme?.promptPresetId ?? null);
    setWorktreeInitialization(
      scheme?.worktreeInitialization ?? createDefaultProjectConfigSchemeWorktreeInitialization()
    );
  }, [open, scheme]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const now = Date.now();
    onSave(
      scheme
        ? {
            ...scheme,
            name: trimmedName,
            description: description.trim(),
            promptPresetId,
            worktreeInitialization,
            updatedAt: now,
          }
        : {
            id: `project-scheme-${now}`,
            name: trimmedName,
            description: description.trim(),
            claudePolicy: createEmptyProjectConfigSchemePolicy(now),
            promptPresetId,
            worktreeInitialization,
            createdAt: now,
            updatedAt: now,
          }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl" zIndexLevel="nested">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('Edit Project Scheme') : t('Add Project Scheme')}
          </DialogTitle>
          <DialogDescription className="ui-type-panel-description">
            {t('Create a reusable template for skill, MCP, and prompt settings.')}{' '}
            {t('Skill and MCP controls apply to Claude, Codex, and Gemini.')}
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <Field>
            <FieldLabel>{t('Name')} *</FieldLabel>
            <Input
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder={t('Release hardening')}
            />
          </Field>

          <Field>
            <FieldLabel>{t('Description')}</FieldLabel>
            <Input
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
              placeholder={t('Optional notes for this scheme')}
            />
          </Field>

          <Field>
            <FieldLabel>{t('Prompt Preset')}</FieldLabel>
            <Select
              value={promptPresetId ?? NO_PROMPT_VALUE}
              onValueChange={(value) => {
                if (!value) {
                  return;
                }
                setPromptPresetId(value === NO_PROMPT_VALUE ? null : value);
              }}
            >
              <SelectTrigger>
                <SelectValue>
                  {promptPresets.find((preset) => preset.id === promptPresetId)?.name ??
                    t('No prompt preset')}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup zIndex={Z_INDEX.DROPDOWN_IN_NESTED_MODAL}>
                <SelectItem value={NO_PROMPT_VALUE}>{t('No prompt preset')}</SelectItem>
                {promptPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </Field>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-muted/20 px-3 py-3">
            <div className="space-y-0.5">
              <label className="ui-type-block-title" htmlFor="scheme-auto-init-switch">
                {t('Auto-initialize new worktrees')}
              </label>
              <p className="ui-type-meta text-muted-foreground">
                {t("Run this scheme's init script after creating a new worktree.")}
              </p>
            </div>
            <Switch
              id="scheme-auto-init-switch"
              checked={worktreeInitialization.autoInitWorktree}
              onCheckedChange={(autoInitWorktree) =>
                setWorktreeInitialization((current) => ({ ...current, autoInitWorktree }))
              }
            />
          </div>

          <Field>
            <FieldLabel>{t('Init Script')}</FieldLabel>
            <Textarea
              placeholder={t('e.g., pnpm install && pnpm dev')}
              value={worktreeInitialization.initScript}
              disabled={!worktreeInitialization.autoInitWorktree}
              onChange={(event) =>
                setWorktreeInitialization((current) => ({
                  ...current,
                  initScript: event.currentTarget.value,
                }))
              }
              className="ui-type-panel-description min-h-24 font-mono"
            />
          </Field>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button onClick={handleSave} disabled={!name.trim()}>
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
