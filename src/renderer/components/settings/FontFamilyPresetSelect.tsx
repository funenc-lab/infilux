import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useI18n } from '@/i18n';
import type { FontPresetSelection } from './interfaceFontPresetModel';

interface FontFamilyPresetSelectProps {
  label: string;
  onValueChange: (value: string | null) => void;
  selection: FontPresetSelection;
}

export function FontFamilyPresetSelect({
  label,
  onValueChange,
  selection,
}: FontFamilyPresetSelectProps) {
  const { t } = useI18n();

  return (
    <div className="settings-field-row">
      <span className="text-sm font-medium">{t(label)}</span>
      <Select value={selection.selectedId} onValueChange={(value) => onValueChange(value)}>
        <SelectTrigger aria-label={t(label)}>
          <SelectValue>{t(selection.selectedLabel)}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {selection.options.map((option) => (
            <SelectItem key={option.id} value={option.id} disabled={option.disabled}>
              <span className="flex min-w-0 flex-col py-0.5">
                <span className="truncate">{t(option.label)}</span>
                {option.fontFamily ? (
                  <span className="truncate text-muted-foreground text-xs">
                    {option.fontFamily}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </div>
  );
}
