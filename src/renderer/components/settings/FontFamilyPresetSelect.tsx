import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { FontPresetSelection, FontPresetSelectionOption } from './interfaceFontPresetModel';

interface FontFamilyPresetSelectProps {
  label: string;
  onValueChange: (value: string | null) => void;
  selection: FontPresetSelection;
}

export function filterFontPresetOptions(
  options: readonly FontPresetSelectionOption[],
  query: string
): FontPresetSelectionOption[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return [...options];
  }

  return options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery));
}

export function FontFamilyPresetSelect({
  label,
  onValueChange,
  selection,
}: FontFamilyPresetSelectProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const optionRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const listboxId = React.useId();
  const visibleOptions = React.useMemo(
    () => filterFontPresetOptions(selection.options, query),
    [query, selection.options]
  );
  const enabledOptions = React.useMemo(
    () => visibleOptions.filter((option) => !option.disabled),
    [visibleOptions]
  );

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchInputRef.current?.focus();
    });

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isOpen]);

  const closePopup = React.useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  const selectOption = React.useCallback(
    (option: FontPresetSelectionOption | undefined) => {
      if (!option?.fontFamily || option.disabled) {
        return;
      }

      closePopup();
      onValueChange(option.id);
    },
    [closePopup, onValueChange]
  );

  const focusOption = React.useCallback((optionId: string | undefined) => {
    if (optionId) {
      optionRefs.current.get(optionId)?.focus();
    }
  }, []);

  const handleSearchKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      const matchingEnabledOptions = filterFontPresetOptions(
        selection.options,
        event.currentTarget.value
      ).filter((option) => !option.disabled);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusOption(matchingEnabledOptions[0]?.id);
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        selectOption(matchingEnabledOptions[0]);
      }
    },
    [focusOption, selectOption, selection.options]
  );

  const handleOptionKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, optionId: string) => {
      const currentIndex = enabledOptions.findIndex((option) => option.id === optionId);

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusOption(enabledOptions[currentIndex + 1]?.id ?? enabledOptions[0]?.id);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (currentIndex <= 0) {
          searchInputRef.current?.focus();
          return;
        }
        focusOption(enabledOptions[currentIndex - 1]?.id);
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        focusOption(enabledOptions[0]?.id);
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        focusOption(enabledOptions.at(-1)?.id);
      }
    },
    [enabledOptions, focusOption]
  );

  const handleOpenChange = React.useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setQuery('');
    }
  }, []);

  return (
    <div className="settings-field-row">
      <span className="text-sm font-medium">{t(label)}</span>
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={t(label)}
          className="relative inline-flex min-h-9 w-full min-w-36 items-center justify-between gap-2 rounded-lg border border-input bg-background px-[calc(--spacing(3)-1px)] text-left text-base outline-none ring-ring/24 transition-[border-color,background-color,box-shadow] pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 focus-visible:border-ring focus-visible:ring-[3px] data-popup-open:border-ring data-popup-open:ring-[3px] sm:min-h-8 sm:text-sm"
          data-slot="font-family-trigger"
        >
          <span className="min-w-0 flex-1 truncate">{t(selection.selectedLabel)}</span>
          <ChevronsUpDownIcon className="-me-1 size-4 shrink-0 opacity-80" />
        </PopoverTrigger>
        <PopoverPopup
          align="end"
          className="h-80 w-[min(30rem,calc(100vw-1rem))] max-w-(--available-width)"
          data-slot="font-family-popup"
          positionMethod="fixed"
          style={
            {
              '--popup-height': 'min(20rem, var(--available-height))',
              '--popup-width': 'min(30rem, calc(100vw - 1rem))',
            } as React.CSSProperties
          }
        >
          <div className="flex h-full min-h-0 flex-col p-2">
            <Input
              aria-controls={listboxId}
              aria-label={t('Search fonts')}
              data-slot="font-family-search"
              onInput={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('Search fonts')}
              ref={searchInputRef}
              size="sm"
              type="search"
              value={query}
            />
            <ScrollArea className="mt-2 min-h-0 flex-1">
              <div className="space-y-0.5 p-1" id={listboxId} role="listbox">
                {visibleOptions.length > 0 ? (
                  visibleOptions.map((option) => {
                    const isSelected = option.id === selection.selectedId;

                    return (
                      <button
                        aria-selected={isSelected}
                        className={cn(
                          'grid min-h-8 w-full grid-cols-[1rem_minmax(0,1fr)] items-center gap-2 rounded-sm px-2 py-1 text-left text-sm outline-none hover:bg-accent/72 focus-visible:bg-accent focus-visible:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-64',
                          isSelected && 'bg-accent text-accent-foreground'
                        )}
                        data-slot="font-family-option"
                        disabled={option.disabled}
                        key={option.id}
                        onClick={() => selectOption(option)}
                        onKeyDown={(event) => handleOptionKeyDown(event, option.id)}
                        ref={(element) => {
                          if (element) {
                            optionRefs.current.set(option.id, element);
                          } else {
                            optionRefs.current.delete(option.id);
                          }
                        }}
                        role="option"
                        title={t(option.label)}
                        type="button"
                      >
                        {isSelected ? (
                          <CheckIcon aria-hidden="true" className="size-4" />
                        ) : (
                          <span aria-hidden="true" className="size-4" />
                        )}
                        <span className="truncate">{t(option.label)}</span>
                      </button>
                    );
                  })
                ) : (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground" role="status">
                    {t('No fonts found')}
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}
