import type { ProjectConfigScheme, PromptPreset } from '@shared/types';
import { createEmptyProjectConfigSchemePolicy } from '@shared/types';
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
import { useI18n } from '@/i18n';

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
  const isEditing = Boolean(scheme);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    setName(scheme?.name ?? '');
    setDescription(scheme?.description ?? '');
    setPromptPresetId(scheme?.promptPresetId ?? null);
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
            updatedAt: now,
          }
        : {
            id: `project-scheme-${now}`,
            name: trimmedName,
            description: description.trim(),
            claudePolicy: createEmptyProjectConfigSchemePolicy(now),
            promptPresetId,
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
            {t('Create a reusable template for skill, MCP, and prompt settings.')}
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
              <SelectPopup>
                <SelectItem value={NO_PROMPT_VALUE}>{t('No prompt preset')}</SelectItem>
                {promptPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
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
