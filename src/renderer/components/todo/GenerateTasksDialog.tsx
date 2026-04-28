import type { ModelId, TodoGeneratedTaskDraft } from '@shared/types';
import { FileText, Folder, FolderGit2, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { useTodoStore } from '@/stores/todo';
import {
  TodoContextMentionPopup,
  useTodoContextMentionAutocomplete,
} from './TodoContextMentionAutocomplete';
import {
  buildTodoGenerateContext,
  buildTodoGenerateTasksRequest,
  createTodoTaskInputFromDraft,
  resolveGeneratedTaskAgentId,
} from './todoGenerateTasks';
import { getPathDisplayName } from './todoTaskContext';
import type { TaskPriority } from './types';
import type { ResolvedAgent } from './useEnabledAgents';

interface GenerateTasksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  worktreePath?: string;
  enabledAgents: ResolvedAgent[];
}

const MAX_GENERATED_TASKS = 6;

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

function buildSelectedIndexes(tasks: readonly TodoGeneratedTaskDraft[]): Set<number> {
  return new Set(tasks.map((_, index) => index));
}

export function GenerateTasksDialog({
  enabledAgents,
  onOpenChange,
  open,
  repoPath,
  worktreePath,
}: GenerateTasksDialogProps) {
  const { t } = useI18n();
  const addTask = useTodoStore((s) => s.addTask);
  const todoPolish = useSettingsStore((s) => s.todoPolish);
  const activeFilePath = useEditorStore((s) => s.activeTabPath);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [requestText, setRequestText] = useState('');
  const [drafts, setDrafts] = useState<TodoGeneratedTaskDraft[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [isGenerating, setIsGenerating] = useState(false);
  const searchRootPath = worktreePath ?? repoPath;
  const mention = useTodoContextMentionAutocomplete({
    inputRef: textareaRef,
    onValueChange: setRequestText,
    rootPath: searchRootPath,
    value: requestText,
  });
  const {
    activeIndex: mentionActiveIndex,
    close: closeMention,
    handleKeyDown: handleMentionKeyDown,
    hasSearched: hasMentionSearched,
    insertMention,
    isOpen: isMentionOpen,
    isSearching: isMentionSearching,
    results: mentionResults,
    updateMentionQuery,
  } = mention;

  const context = useMemo(
    () => buildTodoGenerateContext({ activeFilePath, repoPath, requestText, worktreePath }),
    [activeFilePath, repoPath, requestText, worktreePath]
  );
  const selectedCount = useMemo(
    () => drafts.filter((_, index) => selectedIndexes.has(index)).length,
    [drafts, selectedIndexes]
  );

  useEffect(() => {
    if (!open) {
      setRequestText('');
      setDrafts([]);
      setSelectedIndexes(new Set());
      setIsGenerating(false);
      closeMention();
    }
  }, [closeMention, open]);

  const handleRequestTextChange = useCallback(
    (value: string) => {
      setRequestText(value);
      updateMentionQuery(value);
    },
    [updateMentionQuery]
  );

  const handleGenerate = useCallback(async () => {
    const text = requestText.trim();
    if (!text || isGenerating) {
      return;
    }

    setIsGenerating(true);
    try {
      const result = await window.electronAPI.todo.aiGenerateTasks(
        buildTodoGenerateTasksRequest({
          agents: enabledAgents,
          context,
          maxTasks: MAX_GENERATED_TASKS,
          repoPath,
          settings: {
            timeout: todoPolish.timeout,
            provider: todoPolish.provider,
            model: todoPolish.model as ModelId,
            reasoningEffort: todoPolish.reasoningEffort,
          },
          text,
          worktreePath,
        })
      );

      if (!result.success || !result.tasks?.length) {
        toastManager.add({
          title: t('Failed to generate tasks'),
          description: result.error === 'timeout' ? t('Generation timed out') : result.error,
          type: 'error',
          timeout: 5000,
        });
        return;
      }

      setDrafts(result.tasks);
      setSelectedIndexes(buildSelectedIndexes(result.tasks));
    } catch (error) {
      toastManager.add({
        title: t('Failed to generate tasks'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    } finally {
      setIsGenerating(false);
    }
  }, [context, enabledAgents, isGenerating, repoPath, requestText, t, todoPolish, worktreePath]);

  const handleRequestKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (handleMentionKeyDown(event)) {
        return;
      }

      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void handleGenerate();
      }
    },
    [handleGenerate, handleMentionKeyDown]
  );

  const handleToggleDraft = useCallback((index: number, checked: boolean) => {
    setSelectedIndexes((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(index);
      } else {
        next.delete(index);
      }
      return next;
    });
  }, []);

  const getAgentName = useCallback(
    (draft: TodoGeneratedTaskDraft): string | undefined => {
      const agentId = resolveGeneratedTaskAgentId(draft, enabledAgents);
      return enabledAgents.find((agent) => agent.agentId === agentId)?.name;
    },
    [enabledAgents]
  );

  const handleCreateSelected = useCallback(() => {
    if (selectedCount === 0) {
      return;
    }

    for (const [index, draft] of drafts.entries()) {
      if (!selectedIndexes.has(index)) {
        continue;
      }
      addTask(
        repoPath,
        createTodoTaskInputFromDraft({
          agents: enabledAgents,
          context,
          draft,
        })
      );
    }

    toastManager.add({
      title: t('Tasks created'),
      description: t('Created {{count}} tasks', { count: selectedCount }),
      type: 'success',
      timeout: 4000,
    });
    onOpenChange(false);
  }, [
    addTask,
    context,
    drafts,
    enabledAgents,
    onOpenChange,
    repoPath,
    selectedCount,
    selectedIndexes,
    t,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Plan Tasks with AI')}</DialogTitle>
          <DialogDescription>
            {t('Describe the work and review generated tasks before creating them.')}
          </DialogDescription>
        </DialogHeader>

        <DialogPanel>
          <div className="flex min-w-0 flex-col gap-4">
            <div className="relative flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">{t('Work request')}</label>
              <textarea
                ref={textareaRef}
                className="min-h-[112px] w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none ring-ring focus:ring-2 placeholder:text-muted-foreground"
                placeholder={t('Describe the goal, constraints, and @context to include...')}
                value={requestText}
                onChange={(event) => handleRequestTextChange(event.target.value)}
                onClick={() => updateMentionQuery(requestText)}
                onKeyDown={handleRequestKeyDown}
                autoFocus
              />
              <TodoContextMentionPopup
                activeIndex={mentionActiveIndex}
                anchorRef={textareaRef}
                emptyLabel={t('No files or directories found')}
                hasSearched={hasMentionSearched}
                isOpen={isMentionOpen}
                isSearching={isMentionSearching}
                loadingLabel={t('Searching files and directories...')}
                onSelect={insertMention}
                results={mentionResults}
              />
            </div>

            <div className="flex min-w-0 flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/12 px-2 py-1">
                <FolderGit2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{getPathDisplayName(worktreePath ?? repoPath)}</span>
              </span>
              {context?.files?.map((file) => (
                <span
                  key={file.path}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/12 px-2 py-1"
                  title={file.path}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{file.label ?? getPathDisplayName(file.path)}</span>
                </span>
              ))}
              {context?.directories?.map((directory) => (
                <span
                  key={directory.path}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/12 px-2 py-1"
                  title={directory.path}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {directory.label ?? getPathDisplayName(directory.path)}
                  </span>
                </span>
              ))}
              {enabledAgents.length > 0 && (
                <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/12 px-2 py-1">
                  <Sparkles className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {t('{{count}} enabled agents', { count: enabledAgents.length })}
                  </span>
                </span>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {drafts.length > 0
                  ? t('{{count}} generated tasks', { count: drafts.length })
                  : t('No generated tasks')}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={handleGenerate}
                disabled={!requestText.trim() || isGenerating}
              >
                {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {t('Generate Tasks')}
              </Button>
            </div>

            {drafts.length > 0 && (
              <div className="flex max-h-[42vh] min-w-0 flex-col gap-2 overflow-y-auto pr-1">
                {drafts.map((draft, index) => {
                  const agentName = getAgentName(draft);
                  return (
                    <label
                      key={`${draft.title}-${index}`}
                      className="flex min-w-0 items-start gap-3 rounded-md border border-border/70 bg-background/70 px-3 py-2.5"
                    >
                      <Checkbox
                        checked={selectedIndexes.has(index)}
                        onCheckedChange={(checked) => handleToggleDraft(index, checked === true)}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                            {draft.title}
                          </span>
                          <span className="shrink-0 rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {t(PRIORITY_LABELS[draft.priority])}
                          </span>
                          {agentName && (
                            <span className="shrink-0 rounded-md border border-info/25 bg-info/8 px-1.5 py-0.5 text-[10px] text-info">
                              {agentName}
                            </span>
                          )}
                        </span>
                        <span className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                          {draft.description}
                        </span>
                        {draft.rationale && (
                          <span className="text-[10px] leading-relaxed text-muted-foreground">
                            {draft.rationale}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </DialogPanel>

        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleCreateSelected} disabled={selectedCount === 0}>
            {t('Create selected tasks')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
