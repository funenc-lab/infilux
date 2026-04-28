import { AI_PROVIDER_CATALOG, AI_PROVIDERS, type AIProvider, type ModelId } from '@shared/types';

export interface SelectOption<TValue extends string = string> {
  value: TValue;
  label: string;
}

export const AI_PROVIDER_OPTIONS: SelectOption<AIProvider>[] = AI_PROVIDERS.map((provider) => ({
  value: provider,
  label: AI_PROVIDER_CATALOG[provider].label,
}));

export const AI_MODEL_OPTIONS_BY_PROVIDER = Object.fromEntries(
  AI_PROVIDERS.map((provider) => [
    provider,
    AI_PROVIDER_CATALOG[provider].models.map((model) => ({
      value: model.id,
      label: model.label,
    })),
  ])
) as Record<AIProvider, SelectOption<ModelId>[]>;

export const REASONING_EFFORT_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'xHigh' },
];

export function getDefaultModel(provider: AIProvider): ModelId {
  return AI_PROVIDER_CATALOG[provider].defaultModel;
}

export function getProviderLabel(provider: AIProvider | undefined): string {
  return provider ? (AI_PROVIDER_CATALOG[provider]?.label ?? provider) : 'Claude Code';
}

export function getModelLabel(provider: AIProvider, model: string): string {
  return (
    AI_MODEL_OPTIONS_BY_PROVIDER[provider].find((option) => option.value === model)?.label ?? model
  );
}
