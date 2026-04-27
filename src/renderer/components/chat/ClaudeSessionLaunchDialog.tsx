import type {
  ClaudeCapabilityCatalog,
  ClaudePolicyConfig,
  ClaudePolicyMaterializationMode,
} from '@shared/types';
import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useI18n } from '@/i18n';
import { ClaudePolicyCapabilityList } from '../settings/claude-policy/ClaudePolicyCapabilityList';
import { ClaudePolicyMcpList } from '../settings/claude-policy/ClaudePolicyMcpList';
import {
  type ClaudePolicyDecisionValue,
  createClaudePolicyDraft,
  isClaudePolicyConfigEmpty,
  setClaudePolicyDecision,
  setClaudePolicyDecisionForIds,
} from '../settings/claude-policy/model';

type ClaudeSessionLaunchDialogTab = 'skills' | 'mcp';

function matchesPolicySearch(query: string, candidate: Array<string | undefined>): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return candidate.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

interface ClaudeSessionLaunchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  worktreePath: string;
  agentLabel: string;
  initialPolicy?: ClaudePolicyConfig | null;
  initialMaterializationMode?: ClaudePolicyMaterializationMode;
  onLaunch: (
    policy: ClaudePolicyConfig | null,
    materializationMode?: ClaudePolicyMaterializationMode
  ) => void;
}

export function ClaudeSessionLaunchDialog({
  open,
  onOpenChange,
  repoPath,
  worktreePath,
  agentLabel,
  initialPolicy,
  initialMaterializationMode,
  onLaunch,
}: ClaudeSessionLaunchDialogProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<ClaudePolicyConfig>(() =>
    createClaudePolicyDraft(initialPolicy)
  );
  const [catalog, setCatalog] = useState<ClaudeCapabilityCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ClaudeSessionLaunchDialogTab>('skills');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(createClaudePolicyDraft(initialPolicy));
    setActiveTab('skills');
    setSearchQuery('');
  }, [initialPolicy, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setIsCatalogLoading(true);
    setCatalogError(null);

    window.electronAPI.claudePolicy.catalog
      .list({
        repoPath,
        worktreePath,
      })
      .then((nextCatalog) => {
        if (!cancelled) {
          setCatalog(nextCatalog);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCatalogError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, repoPath, worktreePath]);

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

  const skillItems = useMemo(
    () =>
      (catalog?.capabilities ?? [])
        .filter(
          (item): item is ClaudeCapabilityCatalog['capabilities'][number] =>
            typeof item === 'object' && item !== null && item.kind === 'legacy-skill'
        )
        .filter((item) =>
          matchesPolicySearch(searchQuery, [
            item.id,
            item.name,
            item.description,
            item.sourcePath,
            item.sourceScope,
          ])
        ),
    [catalog?.capabilities, searchQuery]
  );

  const sharedMcpItems = useMemo(
    () =>
      (catalog?.sharedMcpServers ?? []).filter((item) =>
        matchesPolicySearch(searchQuery, [
          item.id,
          item.name,
          item.description,
          item.sourcePath,
          item.sourceScope,
          item.transportType,
          item.scope,
        ])
      ),
    [catalog?.sharedMcpServers, searchQuery]
  );

  const personalMcpItems = useMemo(
    () =>
      (catalog?.personalMcpServers ?? []).filter((item) =>
        matchesPolicySearch(searchQuery, [
          item.id,
          item.name,
          item.description,
          item.sourcePath,
          item.sourceScope,
          item.transportType,
          item.scope,
        ])
      ),
    [catalog?.personalMcpServers, searchQuery]
  );

  const handleLaunch = useCallback(() => {
    const normalizedDraft = createClaudePolicyDraft(draft);
    onLaunch(
      isClaudePolicyConfigEmpty(normalizedDraft)
        ? null
        : {
            ...normalizedDraft,
            updatedAt: Date.now(),
          },
      initialMaterializationMode
    );
    onOpenChange(false);
  }, [draft, initialMaterializationMode, onLaunch, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="h-[min(78vh,44rem)] max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t('Skill & MCP')}</DialogTitle>
          <DialogDescription>{agentLabel}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 px-6">
          <ScrollArea>
            <div className="space-y-6 pt-1 pb-1">
              {catalogError ? (
                <div className="rounded-xl border border-warning/45 bg-warning/8 p-4 text-warning-foreground">
                  <div className="ui-type-block-title">{t('Catalog warning')}</div>
                  <p className="mt-1 ui-type-meta">{catalogError}</p>
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
                      role="tab"
                      aria-selected={activeTab === 'skills'}
                      onClick={() => setActiveTab('skills')}
                    >
                      {t('Skills')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activeTab === 'mcp' ? 'default' : 'ghost'}
                      role="tab"
                      aria-selected={activeTab === 'mcp'}
                      onClick={() => setActiveTab('mcp')}
                    >
                      {t('MCP')}
                    </Button>
                  </div>

                  <div className="relative min-w-0 md:w-72">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.currentTarget.value)}
                      placeholder={t('Search skills or MCP')}
                      className="pl-9"
                    />
                  </div>
                </div>

                {activeTab === 'skills' ? (
                  <ClaudePolicyCapabilityList
                    sectionId="skills"
                    title={t('Skills')}
                    items={skillItems}
                    policy={draft}
                    onDecisionChange={handleCapabilityDecisionChange}
                    onBatchDecisionChange={handleCapabilityBatchDecisionChange}
                  />
                ) : (
                  <div className="space-y-6">
                    <ClaudePolicyMcpList
                      sectionId="shared-mcp"
                      title={t('Shared MCP')}
                      items={sharedMcpItems}
                      bucket="sharedMcp"
                      policy={draft}
                      onDecisionChange={handleSharedMcpDecisionChange}
                      onBatchDecisionChange={handleSharedMcpBatchDecisionChange}
                    />
                    <ClaudePolicyMcpList
                      sectionId="personal-mcp"
                      title={t('Personal MCP')}
                      items={personalMcpItems}
                      bucket="personalMcp"
                      policy={draft}
                      onDecisionChange={handlePersonalMcpDecisionChange}
                      onBatchDecisionChange={handlePersonalMcpBatchDecisionChange}
                    />
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter variant="bare">
          <DialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <Button onClick={handleLaunch} disabled={isCatalogLoading}>
            {t('Launch Agent')}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
