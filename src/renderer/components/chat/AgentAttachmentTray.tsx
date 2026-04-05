import {
  ChevronDown,
  ChevronUp,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  Send,
  X,
} from 'lucide-react';
import { Tooltip, TooltipPopup, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import type { AgentAttachmentItem } from './agentAttachmentTrayModel';

interface AgentAttachmentTrayProps {
  attachments: AgentAttachmentItem[];
  expanded: boolean;
  canSend: boolean;
  primaryActionLabel?: string;
  primaryActionHint?: string;
  isProcessing?: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onPickFiles: () => void;
  onRemoveAttachment: (attachmentId: string) => void;
  onClear: () => void;
  onSend: () => void;
}

export function AgentAttachmentTray({
  attachments,
  expanded,
  canSend,
  primaryActionLabel,
  primaryActionHint,
  isProcessing = false,
  onExpandedChange,
  onPickFiles,
  onRemoveAttachment,
  onClear,
  onSend,
}: AgentAttachmentTrayProps) {
  const { t } = useI18n();
  const attachmentCount = attachments.length;
  const attachmentCountLabel = t('{{count}} attachments', { count: attachmentCount });
  const resolvedPrimaryActionLabel = primaryActionLabel ?? t('Send attachments');

  return (
    <div
      aria-busy={isProcessing}
      className="pointer-events-none absolute bottom-3 right-3 z-20 flex items-end gap-2"
    >
      {expanded && attachmentCount > 0 && (
        <div className="pointer-events-auto flex w-[min(34rem,calc(100vw-1.5rem))] flex-col gap-3 rounded-2xl border border-border/70 bg-background/96 px-3 py-3 shadow-2xl shadow-black/20 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              aria-label={t('Collapse attachments')}
              onClick={() => onExpandedChange(false)}
              className="inline-flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-muted/50 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Paperclip className="h-4 w-4 shrink-0" />
              <span className="truncate">{attachmentCountLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('Add files')}
                onClick={onPickFiles}
                className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t('Add files')}
              </button>
              <button
                type="button"
                aria-label={t('Clear all')}
                onClick={onClear}
                className="rounded-full border border-border/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t('Clear all')}
              </button>
              {primaryActionHint ? (
                <Tooltip>
                  <TooltipTrigger render={<span className="inline-flex" />}>
                    <button
                      type="button"
                      aria-label={resolvedPrimaryActionLabel}
                      onClick={onSend}
                      disabled={!canSend || attachmentCount === 0 || isProcessing}
                      className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                      title={!canSend ? resolvedPrimaryActionLabel : undefined}
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{resolvedPrimaryActionLabel}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipPopup>{primaryActionHint}</TooltipPopup>
                </Tooltip>
              ) : (
                <button
                  type="button"
                  aria-label={resolvedPrimaryActionLabel}
                  onClick={onSend}
                  disabled={!canSend || attachmentCount === 0 || isProcessing}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{resolvedPrimaryActionLabel}</span>
                </button>
              )}
            </div>
          </div>
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {attachments.map((attachment) => {
              const AttachmentIcon = attachment.kind === 'image' ? FileImage : FileText;

              return (
                <li
                  key={attachment.id}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/35 px-3 py-2"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/80 text-muted-foreground">
                    <AttachmentIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {attachment.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground" title={attachment.path}>
                      {attachment.path}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={t('Remove {{name}}', { name: attachment.name })}
                    onClick={() => onRemoveAttachment(attachment.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          aria-label={t('Add files')}
          onClick={onPickFiles}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-background/92 text-foreground shadow-lg shadow-black/15 transition-colors hover:bg-muted"
        >
          {isProcessing ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Paperclip className="h-4 w-4" />
          )}
        </button>
        {attachmentCount > 0 && !expanded && (
          <button
            type="button"
            aria-label={t('Open attachments')}
            onClick={() => onExpandedChange(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border/70 bg-background/92 px-4 text-sm font-medium text-foreground shadow-lg shadow-black/15 transition-colors hover:bg-muted"
          >
            <span>{attachmentCountLabel}</span>
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
