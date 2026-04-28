import type { FileSearchResult, ModelId } from '@shared/types';
import { FileText, Folder, FolderGit2, Loader2, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { useTodoStore } from '@/stores/todo';
import { AUTO_EXECUTE_AGENT_AUTO_VALUE } from './agentCapabilities';
import {
  TodoContextMentionPopup,
  useTodoContextMentionAutocomplete,
} from './TodoContextMentionAutocomplete';
import {
  isTodoContextMentionDirectory,
  mergeTodoContextMentionSelection,
  type TodoContextMentionSelection,
} from './todoContextMentions';
import { createTodoContextFile, getPathDisplayName, hasTodoTaskContext } from './todoTaskContext';
import type { TaskPriority, TaskStatus, TodoTask } from './types';
import { useEnabledAgents } from './useEnabledAgents';

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TodoTask | null; // null = create mode
  defaultStatus: TaskStatus;
  repoPath: string;
  worktreePath?: string;
}

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultStatus,
  repoPath,
  worktreePath,
}: TaskDialogProps) {
  const { t } = useI18n();
  const addTask = useTodoStore((s) => s.addTask);
  const updateTask = useTodoStore((s) => s.updateTask);
  const todoPolish = useSettingsStore((s) => s.todoPolish);
  const activeTabPath = useEditorStore((s) => s.activeTabPath);
  const enabledAgents = useEnabledAgents();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [agentId, setAgentId] = useState(AUTO_EXECUTE_AGENT_AUTO_VALUE);
  const [attachWorktree, setAttachWorktree] = useState(false);
  const [contextWorktreePath, setContextWorktreePath] = useState<string | undefined>();
  const [attachFile, setAttachFile] = useState(false);
  const [attachDirectory, setAttachDirectory] = useState(false);
  const [contextSelection, setContextSelection] = useState<TodoContextMentionSelection>({
    directories: [],
    files: [],
  });
  const [isPolishing, setIsPolishing] = useState(false);
  const didInitializeOpenStateRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const searchRootPath = worktreePath ?? repoPath;
  const contextFiles = contextSelection.files;
  const contextDirectories = contextSelection.directories;

  const handleMentionSelected = useCallback((item: FileSearchResult) => {
    setContextSelection((current) => mergeTodoContextMentionSelection(current, item));
    if (isTodoContextMentionDirectory(item)) {
      setAttachDirectory(true);
    } else {
      setAttachFile(true);
    }
  }, []);

  const titleMention = useTodoContextMentionAutocomplete({
    inputRef: titleInputRef,
    onMentionSelected: handleMentionSelected,
    onValueChange: setTitle,
    rootPath: searchRootPath,
    value: title,
  });
  const descriptionMention = useTodoContextMentionAutocomplete({
    inputRef: descriptionTextareaRef,
    onMentionSelected: handleMentionSelected,
    onValueChange: setDescription,
    rootPath: searchRootPath,
    value: description,
  });
  const {
    activeIndex: titleMentionActiveIndex,
    close: closeTitleMention,
    handleKeyDown: handleTitleMentionKeyDown,
    hasSearched: hasTitleMentionSearched,
    insertMention: insertTitleMention,
    isOpen: isTitleMentionOpen,
    isSearching: isTitleMentionSearching,
    results: titleMentionResults,
    updateMentionQuery: updateTitleMentionQuery,
  } = titleMention;
  const {
    activeIndex: descriptionMentionActiveIndex,
    close: closeDescriptionMention,
    handleKeyDown: handleDescriptionMentionKeyDown,
    hasSearched: hasDescriptionMentionSearched,
    insertMention: insertDescriptionMention,
    isOpen: isDescriptionMentionOpen,
    isSearching: isDescriptionMentionSearching,
    results: descriptionMentionResults,
    updateMentionQuery: updateDescriptionMentionQuery,
  } = descriptionMention;

  useEffect(() => {
    if (!open) {
      didInitializeOpenStateRef.current = false;
      closeTitleMention();
      closeDescriptionMention();
      return;
    }
    if (didInitializeOpenStateRef.current) {
      return;
    }

    didInitializeOpenStateRef.current = true;
    setIsPolishing(false);
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setAgentId(task.agentId ?? AUTO_EXECUTE_AGENT_AUTO_VALUE);
      setAttachWorktree(Boolean(task.context?.worktreePath));
      setContextWorktreePath(task.context?.worktreePath ?? worktreePath);
      setContextSelection({
        directories: task.context?.directories ?? [],
        files: task.context?.files ?? [],
      });
      setAttachFile((task.context?.files?.length ?? 0) > 0);
      setAttachDirectory((task.context?.directories?.length ?? 0) > 0);
    } else {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setAgentId(AUTO_EXECUTE_AGENT_AUTO_VALUE);
      setAttachWorktree(Boolean(worktreePath));
      setContextWorktreePath(worktreePath);
      setContextSelection({
        directories: [],
        files: activeTabPath ? [createTodoContextFile(activeTabPath)] : [],
      });
      setAttachFile(Boolean(activeTabPath));
      setAttachDirectory(false);
    }
  }, [activeTabPath, closeDescriptionMention, closeTitleMention, open, task, worktreePath]);

  const buildTaskContext = useCallback(() => {
    const context = {
      repoPath,
      ...(attachWorktree && contextWorktreePath ? { worktreePath: contextWorktreePath } : {}),
      ...(attachFile && contextFiles.length > 0 ? { files: contextFiles } : {}),
      ...(attachDirectory && contextDirectories.length > 0
        ? { directories: contextDirectories }
        : {}),
    };
    return hasTodoTaskContext(context) ? context : undefined;
  }, [
    attachDirectory,
    attachFile,
    attachWorktree,
    contextDirectories,
    contextFiles,
    contextWorktreePath,
    repoPath,
  ]);

  const handleSubmit = useCallback(() => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    if (task) {
      updateTask(repoPath, task.id, {
        title: trimmedTitle,
        description: description.trim(),
        priority,
        agentId: agentId === AUTO_EXECUTE_AGENT_AUTO_VALUE ? undefined : agentId,
        context: buildTaskContext(),
      });
    } else {
      addTask(repoPath, {
        title: trimmedTitle,
        description: description.trim(),
        priority,
        status: defaultStatus,
        agentId: agentId === AUTO_EXECUTE_AGENT_AUTO_VALUE ? undefined : agentId,
        context: buildTaskContext(),
      });
    }
    onOpenChange(false);
  }, [
    title,
    description,
    priority,
    agentId,
    task,
    repoPath,
    defaultStatus,
    addTask,
    updateTask,
    onOpenChange,
    buildTaskContext,
  ]);

  const handleAttachFileChange = useCallback(
    (checked: boolean) => {
      setAttachFile(checked);
      if (checked && activeTabPath) {
        setContextSelection((current) => ({
          ...current,
          files: [createTodoContextFile(activeTabPath)],
        }));
      }
    },
    [activeTabPath]
  );

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      updateTitleMentionQuery(value);
    },
    [updateTitleMentionQuery]
  );

  const handleDescriptionChange = useCallback(
    (value: string) => {
      setDescription(value);
      updateDescriptionMentionQuery(value);
    },
    [updateDescriptionMentionQuery]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const handlePolish = useCallback(async () => {
    // Use description as raw input; fall back to title if description is empty
    const rawText = description.trim() || title.trim();
    if (!rawText || isPolishing) return;

    setIsPolishing(true);
    try {
      const result = await window.electronAPI.todo.aiPolish({
        text: rawText,
        timeout: todoPolish.timeout,
        provider: todoPolish.provider,
        model: todoPolish.model as ModelId,
        reasoningEffort: todoPolish.reasoningEffort,
        prompt: todoPolish.prompt,
      });

      if (result.success && result.title && result.description !== undefined) {
        setTitle(result.title);
        setDescription(result.description);
      } else {
        toastManager.add({
          title: t('Failed to polish task'),
          description: result.error === 'timeout' ? t('Generation timed out') : result.error,
          type: 'error',
          timeout: 5000,
        });
      }
    } catch (error) {
      toastManager.add({
        title: t('Failed to polish task'),
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
        timeout: 5000,
      });
    } finally {
      setIsPolishing(false);
    }
  }, [description, title, isPolishing, todoPolish, t]);

  const hasContent = description.trim().length > 0 || title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task ? t('Edit Task') : t('New Task')}</DialogTitle>
          <DialogDescription>{t('Task details and execution context.')}</DialogDescription>
        </DialogHeader>

        <DialogPanel>
          <div className="flex flex-col gap-4" onKeyDown={handleKeyDown}>
            <section className="rounded-lg border border-border/70 bg-muted/10 px-3 py-3">
              <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-foreground">{t('Basic Details')}</h3>
                {todoPolish.enabled && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={handlePolish}
                    disabled={isPolishing || !hasContent}
                    title={t('Polish with AI')}
                  >
                    {isPolishing ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    {t('AI Polish')}
                  </Button>
                )}
              </div>

              <div className="grid gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">{t('Task title')}</label>
                  <input
                    ref={titleInputRef}
                    className="h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
                    placeholder={t('Enter task title...')}
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    onClick={() => updateTitleMentionQuery(title)}
                    onKeyDown={(event) => {
                      if (handleTitleMentionKeyDown(event)) {
                        event.stopPropagation();
                      }
                    }}
                    autoFocus
                  />
                  <TodoContextMentionPopup
                    activeIndex={titleMentionActiveIndex}
                    anchorRef={titleInputRef}
                    emptyLabel={t('No files or directories found')}
                    hasSearched={hasTitleMentionSearched}
                    isOpen={isTitleMentionOpen}
                    isSearching={isTitleMentionSearching}
                    loadingLabel={t('Searching files and directories...')}
                    onSelect={insertTitleMention}
                    results={titleMentionResults}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">
                    {t('Task description')}
                  </label>
                  <textarea
                    ref={descriptionTextareaRef}
                    className="min-h-[88px] w-full resize-none rounded-md border bg-transparent px-3 py-2 text-sm outline-none ring-ring placeholder:text-muted-foreground focus:ring-2"
                    placeholder={t('Enter task description...')}
                    value={description}
                    onChange={(e) => handleDescriptionChange(e.target.value)}
                    onClick={() => updateDescriptionMentionQuery(description)}
                    onKeyDown={(event) => {
                      if (handleDescriptionMentionKeyDown(event)) {
                        event.stopPropagation();
                      }
                    }}
                    rows={3}
                  />
                  <TodoContextMentionPopup
                    activeIndex={descriptionMentionActiveIndex}
                    anchorRef={descriptionTextareaRef}
                    emptyLabel={t('No files or directories found')}
                    hasSearched={hasDescriptionMentionSearched}
                    isOpen={isDescriptionMentionOpen}
                    isSearching={isDescriptionMentionSearching}
                    loadingLabel={t('Searching files and directories...')}
                    onSelect={insertDescriptionMention}
                    results={descriptionMentionResults}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border/70 bg-muted/10 px-3 py-3">
              <h3 className="mb-3 text-xs font-semibold text-foreground">
                {t('Execution Settings')}
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">{t('Priority')}</label>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {PRIORITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPriority(opt.value)}
                        className={`flex h-8 items-center rounded-md border px-3 text-sm transition-colors ${
                          priority === opt.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-accent/50'
                        }`}
                      >
                        {t(opt.label)}
                      </button>
                    ))}
                  </div>
                </div>

                {enabledAgents.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">{t('Task Agent')}</label>
                    <Select
                      value={agentId}
                      onValueChange={(value) => {
                        if (typeof value === 'string') {
                          setAgentId(value);
                        }
                      }}
                    >
                      <SelectTrigger
                        aria-label={t('Task Agent')}
                        className="h-9 min-h-9 w-full rounded-md text-sm"
                        size="sm"
                      >
                        <SelectValue>
                          {agentId === AUTO_EXECUTE_AGENT_AUTO_VALUE
                            ? t('Auto Select')
                            : (enabledAgents.find((agent) => agent.agentId === agentId)?.name ??
                              agentId)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value={AUTO_EXECUTE_AGENT_AUTO_VALUE}>
                          {t('Auto Select')}
                        </SelectItem>
                        {enabledAgents.map((agent) => (
                          <SelectItem key={agent.agentId} value={agent.agentId}>
                            {agent.name}
                            {agent.isDefault ? ` (${t('Default')})` : ''}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </div>
                )}
              </div>
            </section>

            <section className="flex flex-col gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground">{t('Task Context')}</h3>
              </div>
              <label className="flex min-w-0 items-start gap-2 text-sm">
                <Checkbox
                  checked={attachWorktree}
                  disabled={!contextWorktreePath && !worktreePath}
                  onCheckedChange={(checked) => {
                    const isChecked = checked === true;
                    setAttachWorktree(isChecked);
                    if (isChecked && !contextWorktreePath && worktreePath) {
                      setContextWorktreePath(worktreePath);
                    }
                  }}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-foreground">{t('Attach current worktree')}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {contextWorktreePath
                      ? getPathDisplayName(contextWorktreePath)
                      : t('No worktree selected')}
                  </span>
                </span>
              </label>
              <label className="flex min-w-0 items-start gap-2 text-sm">
                <Checkbox
                  checked={attachFile}
                  disabled={!activeTabPath && contextFiles.length === 0}
                  onCheckedChange={(checked) => handleAttachFileChange(checked === true)}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1 text-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t('Attach file context')}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {contextFiles.length === 0
                      ? t('No active file')
                      : contextFiles.length === 1
                        ? contextFiles[0]?.path
                        : t('{{count}} files', { count: contextFiles.length })}
                  </span>
                </span>
              </label>
              <label className="flex min-w-0 items-start gap-2 text-sm">
                <Checkbox
                  checked={attachDirectory}
                  disabled={contextDirectories.length === 0}
                  onCheckedChange={(checked) => setAttachDirectory(checked === true)}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1 text-foreground">
                    <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t('Attach directory context')}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {contextDirectories.length === 0
                      ? t('No referenced directories')
                      : contextDirectories.length === 1
                        ? contextDirectories[0]?.path
                        : t('{{count}} directories', { count: contextDirectories.length })}
                  </span>
                </span>
              </label>
            </section>
          </div>
        </DialogPanel>

        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim()}>
            {task ? t('Save') : t('Create')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
