import EmojiPickerReact, { type EmojiClickData, Theme } from 'emoji-picker-react';
import { Smile, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const theme = useSettingsStore((s) => s.theme);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onChange(emojiData.emoji);
    setIsOpen(false);
  };

  const getTheme = (): Theme => {
    if (theme === 'dark') return Theme.DARK;
    if (theme === 'light') return Theme.LIGHT;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? Theme.DARK : Theme.LIGHT;
  };

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
            'hover:bg-accent/50'
          )}
        >
          {value ? (
            <span className="text-lg">{value}</span>
          ) : (
            <Smile className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-muted-foreground">{value ? t('Change') : t('Select')}</span>
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent/50 transition-colors"
            title={t('Clear')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[100]"
              onClick={() => setIsOpen(false)}
              role="presentation"
            />
            <div
              className="control-floating fixed z-[101] overflow-hidden rounded-xl"
              style={{ top: position.top, left: position.left }}
            >
              <EmojiPickerReact
                onEmojiClick={handleEmojiClick}
                theme={getTheme()}
                width={320}
                height={400}
                searchPlaceHolder={t('Search emoji...')}
                previewConfig={{ showPreview: false }}
              />
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
