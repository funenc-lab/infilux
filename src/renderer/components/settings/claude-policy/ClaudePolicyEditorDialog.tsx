import type {
  ClaudeCapabilityCatalog,
  ClaudeCapabilityCatalogItem,
  ClaudeGlobalPolicy,
  ClaudeMcpCatalogItem,
  ClaudeProjectPolicy,
  ClaudeWorktreePolicy,
  ResolveClaudePolicyPreviewRequest,
  ResolvedClaudePolicy,
} from '@shared/types';
import { ChevronRight, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { Input } from '@/components/ui/input';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import { ClaudePolicyCapabilityList } from './ClaudePolicyCapabilityList';
import { ClaudePolicyDisabledNativeSkillList } from './ClaudePolicyDisabledNativeSkillList';
import { ClaudePolicyMcpList } from './ClaudePolicyMcpList';
import { ClaudePolicyPreview } from './ClaudePolicyPreview';
import {
  buildClaudeGlobalPolicy,
  buildClaudeProjectPolicy,
  buildClaudeWorktreePolicy,
  type ClaudePolicyDecisionValue,
  createClaudePolicyDraft,
  hasClaudePolicyConfigChanges,
  setClaudePolicyDecision,
  setClaudePolicyDecisionForIds,
} from './model';
import { getCapabilitySourcePaths } from './sourcePaths';

type ClaudePolicyEditorScope = 'global' | 'project' | 'worktree';
type ClaudePolicyEditorTab = 'skills' | 'mcp';

function matchesPolicySearch(query: string, candidate: Array<string | undefined>): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return candidate.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function filterSkillItems(
  items: ClaudeCapabilityCatalogItem[],
  query: string
): ClaudeCapabilityCatalogItem[] {
  return items.filter((item) =>
    matchesPolicySearch(query, [
      item.id,
      item.name,
      item.description,
      item.sourcePath,
      item.sourceScope,
      ...getCapabilitySourcePaths(item),
    ])
  );
}

function filterMcpItems(items: ClaudeMcpCatalogItem[], query: string): ClaudeMcpCatalogItem[] {
  return items.filter((item) =>
    matchesPolicySearch(query, [
      item.id,
      item.name,
      item.description,
      item.sourcePath,
      item.sourceScope,
      item.transportType,
      item.scope,
    ])
  );
}

interface ClaudePolicyEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: ClaudePolicyEditorScope;
  globalPolicy: ClaudeGlobalPolicy | null;
  repoPath: string;
  repoName?: string;
  worktreePath?: string;
  worktreeName?: string;
  projectPolicy: ClaudeProjectPolicy | null;
  worktreePolicy: ClaudeWorktreePolicy | null;
  onSave: (
    policy: ClaudeGlobalPolicy | ClaudeProjectPolicy | ClaudeWorktreePolicy | null,
    preview: ResolvedClaudePolicy | null
  ) => void;
  onCatalogRefresh?: () => void;
  onNativeSkillFileChanged?: () => void;
}

export function ClaudePolicyEditorDialog({
  open,
  onOpenChange,
  scope,
  globalPolicy,
  repoPath,
  repoName,
  worktreePath,
  worktreeName,
  projectPolicy,
  worktreePolicy,
  onSave,
  onCatalogRefresh,
  onNativeSkillFileChanged,
}: ClaudePolicyEditorDialogProps) {
  const { t } = useI18n();
  const activePolicy =
    scope === 'global' ? globalPolicy : scope === 'project' ? projectPolicy : worktreePolicy;
  const [draft, setDraft] = useState(() => createClaudePolicyDraft(activePolicy));
  const [catalog, setCatalog] = useState<ClaudeCapabilityCatalog | null>(null);
  const [resolvedPolicy, setResolvedPolicy] = useState<ResolvedClaudePolicy | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ClaudePolicyEditorTab>('skills');
  const [searchQuery, setSearchQuery] = useState('');
  const catalogRequestIdRef = useRef(0);
  const previewRequestIdRef = useRef(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(createClaudePolicyDraft(activePolicy));
    setIsPreviewExpanded(false);
    setActiveTab('skills');
    setSearchQuery('');
  }, [activePolicy, open]);

  const refreshCatalog = useCallback(async () => {
    const requestId = catalogRequestIdRef.current + 1;
    catalogRequestIdRef.current = requestId;
    setIsCatalogLoading(true);
    setCatalogError(null);

    try {
      const nextCatalog = await window.electronAPI.claudePolicy.catalog.list({
        repoPath,
        worktreePath: worktreePath || repoPath,
      });
      if (catalogRequestIdRef.current === requestId) {
        setCatalog(nextCatalog);
      }
    } catch (error) {
      if (catalogRequestIdRef.current === requestId) {
        setCatalogError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (catalogRequestIdRef.current === requestId) {
        setIsCatalogLoading(false);
      }
    }
  }, [repoPath, worktreePath]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void refreshCatalog();

    return () => {
      catalogRequestIdRef.current += 1;
    };
  }, [open, refreshCatalog]);

  const previewRequest = useMemo<ResolveClaudePolicyPreviewRequest>(() => {
    const effectiveWorktreePath = worktreePath || repoPath;

    return {
      repoPath,
      worktreePath: effectiveWorktreePath,
      globalPolicy: scope === 'global' ? buildClaudeGlobalPolicy(draft) : globalPolicy,
      projectPolicy:
        scope === 'project' ? buildClaudeProjectPolicy(repoPath, draft) : projectPolicy,
      worktreePolicy:
        scope === 'worktree' && effectiveWorktreePath
          ? buildClaudeWorktreePolicy(repoPath, effectiveWorktreePath, draft)
          : worktreePolicy,
    };
  }, [draft, globalPolicy, projectPolicy, repoPath, scope, worktreePath, worktreePolicy]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setIsPreviewLoading(true);
    setPreviewError(null);

    window.electronAPI.claudePolicy.preview
      .resolve(previewRequest)
      .then((nextPreview) => {
        if (previewRequestIdRef.current === requestId) {
          setResolvedPolicy(nextPreview);
        }
      })
      .catch((error) => {
        if (previewRequestIdRef.current === requestId) {
          setPreviewError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (previewRequestIdRef.current === requestId) {
          setIsPreviewLoading(false);
        }
      });
  }, [open, previewRequest]);

  const handleCapabilityDecisionChange = useCallback(
    (id: string, decision: ClaudePolicyDecisionValue) => {
      setDraft((current) => setClaudePolicyDecision(current, 'capability', id, decision));
    },
    []
  );
  const handleSharedMcpDecisionChange = useCallback(
    (id: string, decision: ClaudePolicyDecisionValue) => {
      setDraft((current) => setClaudePolicyDecision(current, 'sharedMcp', id, decision));
    },
    []
  );
  const handlePersonalMcpDecisionChange = useCallback(
    (id: string, decision: ClaudePolicyDecisionValue) => {
      setDraft((current) => setClaudePolicyDecision(current, 'personalMcp', id, decision));
    },
    []
  );
  const handleCapabilityBatchDecisionChange = useCallback(
    (ids: string[], decision: ClaudePolicyDecisionValue) => {
      setDraft((current) => setClaudePolicyDecisionForIds(current, 'capability', ids, decision));
    },
    []
  );
  const handleSharedMcpBatchDecisionChange = useCallback(
    (ids: string[], decision: ClaudePolicyDecisionValue) => {
      setDraft((current) => setClaudePolicyDecisionForIds(current, 'sharedMcp', ids, decision));
    },
    []
  );
  const handlePersonalMcpBatchDecisionChange = useCallback(
    (ids: string[], decision: ClaudePolicyDecisionValue) => {
      setDraft((current) => setClaudePolicyDecisionForIds(current, 'personalMcp', ids, decision));
    },
    []
  );
  const handleActiveTabChange = useCallback((nextTab: ClaudePolicyEditorTab) => {
    setActiveTab((currentTab) => {
      if (currentTab !== nextTab) {
        setSearchQuery('');
      }
      return nextTab;
    });
  }, []);
  const nativeSkillRootPath =
    scope === 'global' ? undefined : scope === 'project' ? repoPath : worktreePath || repoPath;

  const isDirty = useMemo(
    () => hasClaudePolicyConfigChanges(activePolicy, draft),
    [activePolicy, draft]
  );
  const skillItems = useMemo(
    () => (catalog?.capabilities ?? []).filter((item) => item.kind === 'legacy-skill'),
    [catalog?.capabilities]
  );
  const filteredSkillItems = useMemo(
    () => filterSkillItems(skillItems, searchQuery),
    [searchQuery, skillItems]
  );
  const filteredDisabledNativeSkillItems = useMemo(
    () => filterSkillItems(catalog?.disabledNativeSkills ?? [], searchQuery),
    [catalog?.disabledNativeSkills, searchQuery]
  );
  const filteredSharedMcpItems = useMemo(
    () => filterMcpItems(catalog?.sharedMcpServers ?? [], searchQuery),
    [catalog?.sharedMcpServers, searchQuery]
  );
  const filteredPersonalMcpItems = useMemo(
    () => filterMcpItems(catalog?.personalMcpServers ?? [], searchQuery),
    [catalog?.personalMcpServers, searchQuery]
  );

  const handleSave = useCallback(() => {
    const nextPolicy =
      scope === 'global'
        ? buildClaudeGlobalPolicy(draft)
        : scope === 'project'
          ? buildClaudeProjectPolicy(repoPath, draft)
          : buildClaudeWorktreePolicy(repoPath, worktreePath || repoPath, draft);

    onSave(nextPolicy, resolvedPolicy);
    onOpenChange(false);
  }, [draft, onOpenChange, onSave, repoPath, resolvedPolicy, scope, worktreePath]);

  const handleDisableNativeSkill = useCallback(
    async (sourcePath: string) => {
      const effectiveNativeSkillRootPath = nativeSkillRootPath || repoPath;
      try {
        await window.electronAPI.claudePolicy.nativeSkill.disable({
          worktreePath: effectiveNativeSkillRootPath,
          sourcePath,
        });
        toastManager.add({
          type: 'success',
          title: t('Skill file disabled'),
          description: t('The skill folder was moved out of the workspace native skill directory.'),
        });
        await refreshCatalog();
        onCatalogRefresh?.();
        onNativeSkillFileChanged?.();
      } catch (error) {
        toastManager.add({
          type: 'error',
          title: t('Unable to disable skill file'),
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [nativeSkillRootPath, onCatalogRefresh, onNativeSkillFileChanged, refreshCatalog, repoPath, t]
  );

  const handleRestoreNativeSkill = useCallback(
    async (sourcePath: string) => {
      const effectiveNativeSkillRootPath = nativeSkillRootPath || repoPath;
      try {
        await window.electronAPI.claudePolicy.nativeSkill.restore({
          worktreePath: effectiveNativeSkillRootPath,
          sourcePath,
        });
        toastManager.add({
          type: 'success',
          title: t('Skill file restored'),
          description: t(
            'The skill folder was moved back into the workspace native skill directory.'
          ),
        });
        await refreshCatalog();
        onCatalogRefresh?.();
        onNativeSkillFileChanged?.();
      } catch (error) {
        toastManager.add({
          type: 'error',
          title: t('Unable to restore skill file'),
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [nativeSkillRootPath, onCatalogRefresh, onNativeSkillFileChanged, refreshCatalog, repoPath, t]
  );

  const dialogTitle =
    scope === 'global'
      ? 'Global Skill & MCP'
      : scope === 'project'
        ? 'Project Skill & MCP'
        : 'Worktree Skill & MCP';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup data-policy-dialog="editor" className="max-w-5xl h-[min(85vh,54rem)]">
        <DialogHeader>
          <DialogTitle>{t(dialogTitle)}</DialogTitle>
          <DialogDescription>
            {scope === 'global'
              ? repoName || repoPath || t('All repositories')
              : scope === 'project'
                ? repoName || repoPath
                : `${worktreeName || worktreePath || repoPath}`}
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="flex-1 min-h-0 space-y-6">
          {catalogError ? (
            <div className="rounded-xl border border-warning/45 bg-warning/8 p-4 text-warning-foreground">
              <div className="ui-type-block-title">{t('Catalog warning')}</div>
              <p className="mt-1 ui-type-meta">{catalogError}</p>
            </div>
          ) : null}

          {previewError ? (
            <div className="rounded-xl border border-warning/45 bg-warning/8 p-4 text-warning-foreground">
              <div className="ui-type-block-title">{t('Preview warning')}</div>
              <p className="mt-1 ui-type-meta">{previewError}</p>
            </div>
          ) : null}

          {isCatalogLoading && !catalog ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-background/40 p-4">
              <p className="ui-type-meta text-muted-foreground">
                {t('Loading skill and MCP catalog...')}
              </p>
            </div>
          ) : null}

          <section className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div
                role="tablist"
                aria-label={t('Skills and MCP')}
                className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background/80 p-1"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === 'skills' ? 'default' : 'ghost'}
                  data-policy-tab="skills"
                  role="tab"
                  aria-selected={activeTab === 'skills'}
                  onClick={() => handleActiveTabChange('skills')}
                >
                  {t('Skills')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeTab === 'mcp' ? 'default' : 'ghost'}
                  data-policy-tab="mcp"
                  role="tab"
                  aria-selected={activeTab === 'mcp'}
                  onClick={() => handleActiveTabChange('mcp')}
                >
                  {t('MCP')}
                </Button>
              </div>

              <div className="relative min-w-0 md:w-72">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  data-policy-search="input"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.currentTarget.value)}
                  placeholder={t('Search skills or MCP')}
                  className="pl-9"
                />
              </div>
            </div>

            {activeTab === 'skills' ? (
              <div className="space-y-6">
                <ClaudePolicyCapabilityList
                  sectionId="skills"
                  title={t('Skills')}
                  description={t(
                    'Enable or disable each discovered skill for this scope. Leave it unselected to inherit.'
                  )}
                  items={filteredSkillItems}
                  policy={draft}
                  nativeSkillRootPath={nativeSkillRootPath}
                  onDecisionChange={handleCapabilityDecisionChange}
                  onBatchDecisionChange={handleCapabilityBatchDecisionChange}
                  onDisableNativeSkill={nativeSkillRootPath ? handleDisableNativeSkill : undefined}
                />
                {nativeSkillRootPath ? (
                  <ClaudePolicyDisabledNativeSkillList
                    items={filteredDisabledNativeSkillItems}
                    onRestoreNativeSkill={handleRestoreNativeSkill}
                  />
                ) : null}
              </div>
            ) : (
              <div className="space-y-6">
                <ClaudePolicyMcpList
                  sectionId="shared-mcp"
                  title={t('Shared MCP')}
                  description={t(
                    'Enable or disable repository and worktree MCP servers for this scope. Leave them unselected to inherit.'
                  )}
                  items={filteredSharedMcpItems}
                  bucket="sharedMcp"
                  policy={draft}
                  onDecisionChange={handleSharedMcpDecisionChange}
                  onBatchDecisionChange={handleSharedMcpBatchDecisionChange}
                />

                <ClaudePolicyMcpList
                  sectionId="personal-mcp"
                  title={t('Personal MCP')}
                  description={t(
                    'Enable or disable personal MCP servers for this scope. Leave them unselected to inherit.'
                  )}
                  items={filteredPersonalMcpItems}
                  bucket="personalMcp"
                  policy={draft}
                  onDecisionChange={handlePersonalMcpDecisionChange}
                  onBatchDecisionChange={handlePersonalMcpBatchDecisionChange}
                />
              </div>
            )}
          </section>

          <Collapsible
            open={isPreviewExpanded}
            onOpenChange={setIsPreviewExpanded}
            className="rounded-xl border border-border/70 bg-background/40 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <h3 className="ui-type-block-title">{t('Effective Access')}</h3>
                <p className="ui-type-meta text-muted-foreground">
                  {t(
                    'Review the resolved skill and MCP access that is currently effective for this scope.'
                  )}
                </p>
              </div>

              <CollapsibleTrigger
                data-policy-action="toggle-preview"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
                aria-label={t('Effective Access')}
                title={t('Effective Access')}
              >
                <ChevronRight
                  className={`h-4 w-4 transition-transform duration-200 ${isPreviewExpanded ? 'rotate-90' : ''}`}
                />
              </CollapsibleTrigger>
            </div>

            {isPreviewExpanded ? (
              <CollapsibleContent className="mt-4">
                <ClaudePolicyPreview
                  catalog={catalog}
                  resolvedPolicy={resolvedPolicy}
                  staleNotice={isPreviewLoading ? t('Resolving the latest preview...') : null}
                  showHeader={false}
                />
              </CollapsibleContent>
            ) : null}
          </Collapsible>
        </DialogPanel>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button
            data-policy-action="save"
            onClick={handleSave}
            disabled={isCatalogLoading || isPreviewLoading || !isDirty}
          >
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
