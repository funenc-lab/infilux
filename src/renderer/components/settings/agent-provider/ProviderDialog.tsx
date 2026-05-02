import { type AgentProviderProfile, AI_PROVIDER_CATALOG, type AIProvider } from '@shared/types';
import { Eye, EyeOff } from 'lucide-react';
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
import { getAgentProviderProfileAdapter } from '@/lib/agentProviderProfiles';
import { Z_INDEX } from '@/lib/z-index';
import { useSettingsStore } from '@/stores/settings';
import { AI_PROVIDER_OPTIONS } from '../aiProviderOptions';
import { buildProviderProfileFromDraft, canSaveProviderProfileDraft } from './providerDialogModel';

interface ProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: AgentProviderProfile | null;
  initialValues?: Partial<AgentProviderProfile> | null;
  source?: 'current' | 'manual';
}

const BASE_URL_PLACEHOLDERS: Record<AIProvider, string> = {
  'claude-code': 'https://api.anthropic.com',
  'codex-cli': 'https://api.openai.com/v1',
  'cursor-cli': 'https://api.cursor.com',
  'gemini-cli': 'https://generativelanguage.googleapis.com',
};

const AUTH_TOKEN_PLACEHOLDERS: Record<AIProvider, string> = {
  'claude-code': 'sk-ant-...',
  'codex-cli': 'sk-...',
  'cursor-cli': 'key-...',
  'gemini-cli': 'AIza...',
};

export function buildDefaultProviderProfileName(providerId: AIProvider, baseUrl?: string): string {
  const providerLabel = AI_PROVIDER_CATALOG[providerId].label;
  if (!baseUrl) {
    return `${providerLabel} Current`;
  }

  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname ? `${providerLabel} - ${hostname}` : `${providerLabel} Current`;
  } catch {
    return `${providerLabel} Current`;
  }
}

export function ProviderDialog({
  open,
  onOpenChange,
  provider,
  initialValues,
  source = 'manual',
}: ProviderDialogProps) {
  const { t } = useI18n();
  const addAgentProvider = useSettingsStore((s) => s.addAgentProvider);
  const updateAgentProvider = useSettingsStore((s) => s.updateAgentProvider);

  const isEditing = !!provider;

  const [showToken, setShowToken] = React.useState(false);
  const [providerId, setProviderId] = React.useState<AIProvider>('claude-code');
  const [name, setName] = React.useState('');
  const [baseUrl, setBaseUrl] = React.useState('');
  const [authToken, setAuthToken] = React.useState('');
  const [model, setModel] = React.useState('');
  const [smallFastModel, setSmallFastModel] = React.useState('');
  const [defaultSonnetModel, setDefaultSonnetModel] = React.useState('');
  const [defaultOpusModel, setDefaultOpusModel] = React.useState('');
  const [defaultHaikuModel, setDefaultHaikuModel] = React.useState('');

  // Initialize form values when the dialog opens.
  React.useEffect(() => {
    if (open) {
      setShowToken(false);
      if (provider) {
        setProviderId(provider.providerId);
        setName(provider.name);
        setBaseUrl(provider.baseUrl);
        setAuthToken(provider.authToken);
        setModel(provider.model ?? '');
        setSmallFastModel(provider.smallFastModel ?? '');
        setDefaultSonnetModel(provider.defaultSonnetModel ?? '');
        setDefaultOpusModel(provider.defaultOpusModel ?? '');
        setDefaultHaikuModel(provider.defaultHaikuModel ?? '');
      } else if (initialValues) {
        // Current config snapshots should not copy transient shortcut fields into new profiles.
        const nextProviderId = initialValues.providerId ?? 'claude-code';
        setProviderId(nextProviderId);
        setName(
          initialValues.name ??
            buildDefaultProviderProfileName(nextProviderId, initialValues.baseUrl)
        );
        setBaseUrl(initialValues.baseUrl ?? '');
        setAuthToken(initialValues.authToken ?? '');
        setModel('');
        setSmallFastModel('');
        setDefaultSonnetModel(initialValues.defaultSonnetModel ?? '');
        setDefaultOpusModel(initialValues.defaultOpusModel ?? '');
        setDefaultHaikuModel(initialValues.defaultHaikuModel ?? '');
      } else {
        setProviderId('claude-code');
        setName('');
        setBaseUrl('');
        setAuthToken('');
        setModel('');
        setSmallFastModel('');
        setDefaultSonnetModel('');
        setDefaultOpusModel('');
        setDefaultHaikuModel('');
      }
    }
  }, [open, provider, initialValues]);

  const handleSave = async () => {
    if (!name.trim() || !baseUrl.trim() || !authToken.trim()) {
      return;
    }

    const providerData = buildProviderProfileFromDraft({
      authToken,
      baseUrl,
      defaultHaikuModel,
      defaultOpusModel,
      defaultSonnetModel,
      existingProfile: provider
        ? {
            displayOrder: provider.displayOrder,
            enabled: provider.enabled,
            id: provider.id,
          }
        : null,
      generateId: () => crypto.randomUUID(),
      model,
      name,
      providerId,
      smallFastModel,
    });

    if (isEditing) {
      updateAgentProvider(provider.id, providerData);
    } else {
      addAgentProvider(providerData);
    }

    onOpenChange(false);
  };

  const selectedAdapter = getAgentProviderProfileAdapter(providerId);
  const providerProfileOptions = React.useMemo(
    () =>
      AI_PROVIDER_OPTIONS.filter((option) => {
        const adapter = getAgentProviderProfileAdapter(option.value);
        return adapter.supportsProfiles;
      }),
    []
  );
  const isValid = canSaveProviderProfileDraft({
    adapterSupportsProfiles: selectedAdapter.supportsProfiles,
    authToken,
    baseUrl,
    name,
  });
  const isClaudeCode = providerId === 'claude-code';
  const isSavingCurrentConfig = !isEditing && source === 'current';
  const providerTypeLocked = isSavingCurrentConfig;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup zIndexLevel="nested">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? t('Edit Provider')
              : isSavingCurrentConfig
                ? t('Save Current CLI Config')
                : t('Manual Add Provider')}
          </DialogTitle>
          <DialogDescription className="ui-type-panel-description">
            {isSavingCurrentConfig
              ? t('Save and switch detected provider profiles for supported Agent CLIs')
              : t(
                  'Manual provider settings are for custom gateways and unsupported auto-detection cases.'
                )}
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <Field>
            <FieldLabel>{t('Provider Type')} *</FieldLabel>
            <Select
              value={providerId}
              onValueChange={(value) => setProviderId(value as AIProvider)}
              disabled={providerTypeLocked}
            >
              <SelectTrigger>
                <SelectValue>{AI_PROVIDER_CATALOG[providerId].label}</SelectValue>
              </SelectTrigger>
              <SelectPopup zIndex={Z_INDEX.DROPDOWN_IN_MODAL}>
                {providerProfileOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            {!selectedAdapter.supportsProfiles && (
              <p className="text-xs text-muted-foreground">
                {isSavingCurrentConfig
                  ? t('Provider profile switching is not available for this AI tool yet.')
                  : t('This profile can be saved, but switching waits for this provider adapter.')}
              </p>
            )}
          </Field>

          <Field>
            <FieldLabel>{t('Name')} *</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('e.g., Official API')}
            />
          </Field>

          {/* Base URL */}
          <Field>
            <FieldLabel>{t('Base URL')} *</FieldLabel>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={BASE_URL_PLACEHOLDERS[providerId]}
            />
          </Field>

          <Field>
            <FieldLabel>{t('Auth Token')} *</FieldLabel>
            <div className="relative w-full">
              <Input
                type={showToken ? 'text' : 'password'}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder={AUTH_TOKEN_PLACEHOLDERS[providerId]}
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
              {t('Advanced Options')}
            </summary>
            <div className="mt-3 space-y-3">
              <Field>
                <FieldLabel>{t('Model')}</FieldLabel>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={AI_PROVIDER_CATALOG[providerId].defaultModel}
                />
              </Field>

              {isClaudeCode && (
                <>
                  <Field>
                    <FieldLabel>{t('Small/Fast Model')}</FieldLabel>
                    <Input
                      value={smallFastModel}
                      onChange={(e) => setSmallFastModel(e.target.value)}
                      placeholder="claude-3-haiku-..."
                    />
                  </Field>

                  <Field>
                    <FieldLabel>{t('Sonnet Model')}</FieldLabel>
                    <Input
                      value={defaultSonnetModel}
                      onChange={(e) => setDefaultSonnetModel(e.target.value)}
                      placeholder="claude-sonnet-4-..."
                    />
                  </Field>

                  <Field>
                    <FieldLabel>{t('Opus Model')}</FieldLabel>
                    <Input
                      value={defaultOpusModel}
                      onChange={(e) => setDefaultOpusModel(e.target.value)}
                      placeholder="claude-opus-4-..."
                    />
                  </Field>

                  <Field>
                    <FieldLabel>{t('Haiku Model')}</FieldLabel>
                    <Input
                      value={defaultHaikuModel}
                      onChange={(e) => setDefaultHaikuModel(e.target.value)}
                      placeholder="claude-3-haiku-..."
                    />
                  </Field>
                </>
              )}
            </div>
          </details>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button onClick={handleSave} disabled={!isValid}>
            {isEditing ? t('Save') : t('Add')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
