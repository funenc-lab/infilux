import type {
  ClaudeCapabilityCatalog,
  ClaudeCapabilityCatalogItem,
  ClaudeGlobalPolicy,
  ClaudeMcpCatalogItem,
  ResolvedClaudePolicy,
} from '@shared/types';
import { RefreshCcw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getClaudeGlobalPolicy, saveClaudeGlobalPolicy } from '@/App/storage';
import { ClaudePolicyEditorDialog } from '@/components/settings/claude-policy/ClaudePolicyEditorDialog';
import { ClaudePolicyPreview } from '@/components/settings/claude-policy/ClaudePolicyPreview';
import {
  getClaudePolicySummaryItems,
  hasClaudePolicyConfigChanges,
} from '@/components/settings/claude-policy/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { ClaudePolicySourcePaths } from './ClaudePolicySourcePaths';
import { getCapabilitySourcePaths } from './sourcePaths';

function matchesCatalogSearch(query: string, candidate: Array<string | undefined>): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  return candidate.some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.name.localeCompare(right.name));
}

function groupBySourceScope<T extends { sourceScope: string; name: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const current = groups.get(item.sourceScope) ?? [];
    current.push(item);
    groups.set(item.sourceScope, current);
  }
  return [...groups.entries()].map(([scope, entries]) => ({
    scope,
    entries: sortByName(entries),
  }));
}

function CatalogCapabilityRow({ item }: { item: ClaudeCapabilityCatalogItem }) {
  const { t } = useI18n();

  return (
    <div
      className="rounded-xl border border-border/70 bg-background/60 p-3"
      data-catalog-item-id={item.id}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="ui-type-block-title">{item.name}</div>
        <Badge variant="secondary" size="sm">
          {t(item.sourceScope)}
        </Badge>
      </div>
      {item.description ? (
        <p className="mt-2 ui-type-meta text-muted-foreground">{item.description}</p>
      ) : null}
      <div className="mt-2">
        <ClaudePolicySourcePaths
          itemId={item.id}
          sourcePath={item.sourcePath}
          sourcePaths={item.sourcePaths}
          triggerDataAttribute="data-catalog-source-paths-trigger"
          contentDataAttribute="data-catalog-source-paths-content"
        />
      </div>
    </div>
  );
}

function CatalogMcpRow({ item }: { item: ClaudeMcpCatalogItem }) {
  const { t } = useI18n();

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="ui-type-block-title">{item.name}</div>
        <Badge variant="outline" size="sm">
          {t(item.scope)}
        </Badge>
        <Badge variant="secondary" size="sm">
          {t(item.sourceScope)}
        </Badge>
        {item.transportType ? (
          <Badge variant="info" size="sm">
            {t(item.transportType)}
          </Badge>
        ) : null}
      </div>
      {item.description ? (
        <p className="mt-2 ui-type-meta text-muted-foreground">{item.description}</p>
      ) : null}
      {item.sourcePath ? (
        <p className="mt-2 ui-type-meta break-all text-muted-foreground">{item.sourcePath}</p>
      ) : null}
    </div>
  );
}

interface ClaudeCapabilityCatalogSectionProps {
  repoPath?: string;
}

type ClaudeCatalogTab = 'skills' | 'mcp';

export function ClaudeCapabilityCatalogSection({ repoPath }: ClaudeCapabilityCatalogSectionProps) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<ClaudeCapabilityCatalog | null>(null);
  const [globalPolicy, setGlobalPolicy] = useState<ClaudeGlobalPolicy | null>(() =>
    getClaudeGlobalPolicy()
  );
  const [globalPreview, setGlobalPreview] = useState<ResolvedClaudePolicy | null>(null);
  const [globalPolicyEditorOpen, setGlobalPolicyEditorOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<ClaudeCatalogTab>('skills');
  const markClaudePolicyStaleGlobally = useAgentSessionsStore(
    (s) => s.markClaudePolicyStaleGlobally
  );

  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const nextCatalog = await window.electronAPI.claudePolicy.catalog.list(
        repoPath
          ? {
              repoPath,
              worktreePath: repoPath,
            }
          : undefined
      );
      setCatalog(nextCatalog);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setGlobalPolicy(getClaudeGlobalPolicy());
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.claudePolicy?.preview) {
      return;
    }

    let cancelled = false;
    const previewRepoPath = repoPath ?? '';
    const previewWorktreePath = repoPath ?? '';

    window.electronAPI.claudePolicy.preview
      .resolve({
        repoPath: previewRepoPath,
        worktreePath: previewWorktreePath,
        globalPolicy,
        projectPolicy: null,
        worktreePolicy: null,
      })
      .then((preview) => {
        if (!cancelled) {
          setGlobalPreview(preview);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGlobalPreview(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [globalPolicy, repoPath]);

  const filteredSkills = useMemo(
    () =>
      sortByName(catalog?.capabilities ?? [])
        .filter((item) => item.kind === 'legacy-skill')
        .filter((item) =>
          matchesCatalogSearch(searchQuery, [
            item.id,
            item.name,
            item.description,
            item.sourcePath,
            item.sourceScope,
            ...getCapabilitySourcePaths(item),
          ])
        ),
    [catalog?.capabilities, searchQuery]
  );
  const filteredSharedMcp = useMemo(
    () =>
      sortByName(catalog?.sharedMcpServers ?? []).filter((item) =>
        matchesCatalogSearch(searchQuery, [
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
  const filteredPersonalMcp = useMemo(
    () =>
      sortByName(catalog?.personalMcpServers ?? []).filter((item) =>
        matchesCatalogSearch(searchQuery, [
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
  const policySummaryItems = useMemo(
    () => getClaudePolicySummaryItems(globalPolicy),
    [globalPolicy]
  );

  return (
    <section className="space-y-6">
      <div className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="ui-type-block-title">{t('Global Skill & MCP')}</div>
            <p className="ui-type-meta text-muted-foreground">
              {t(
                'Control the default skill and MCP baseline applied to Claude sessions across repositories and worktrees.'
              )}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            data-policy-action="edit-global"
            onClick={() => setGlobalPolicyEditorOpen(true)}
          >
            {t('Configure')}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {policySummaryItems.map((item) => (
            <div key={item.key} className="rounded-lg border border-border/70 bg-background/70 p-3">
              <div className="ui-type-meta text-muted-foreground">{t(item.label)}</div>
              <div className="mt-2 text-sm text-foreground">
                {t('Enabled')} {item.allowed}
              </div>
              <div className="ui-type-meta text-muted-foreground">
                {t('Disabled')} {item.blocked}
              </div>
            </div>
          ))}
        </div>

        {globalPreview ? (
          <ClaudePolicyPreview catalog={catalog} resolvedPolicy={globalPreview} />
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="ui-type-panel-title">{t('Skill & MCP Catalog')}</h2>
            <Badge variant="info" size="sm">
              {t('Read only')}
            </Badge>
          </div>
          <p className="ui-type-panel-description max-w-3xl text-muted-foreground">
            {t(
              'Browse every discovered skill and MCP source before deciding what each scope should allow or block.'
            )}
          </p>
        </div>

        <Button variant="outline" onClick={() => void loadCatalog()} disabled={isLoading}>
          <RefreshCcw className="h-4 w-4" />
          {t('Refresh')}
        </Button>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-warning/45 bg-warning/8 p-4 text-warning-foreground">
          <div className="ui-type-block-title">{t('Catalog warning')}</div>
          <p className="mt-1 ui-type-meta">{errorMessage}</p>
        </div>
      ) : null}

      {isLoading && !catalog ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-background/40 p-4">
          <p className="ui-type-meta text-muted-foreground">{t('Loading catalog...')}</p>
        </div>
      ) : null}

      <div className="space-y-6">
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
              data-catalog-tab="skills"
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
              data-catalog-tab="mcp"
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
              data-catalog-search="input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
              placeholder={t('Search skills or MCP')}
              className="pl-9"
            />
          </div>
        </div>

        {activeTab === 'skills' ? (
          <section className="space-y-3" data-catalog-section="skills">
            <div className="space-y-1">
              <h3 className="ui-type-block-title">{t('Skills')}</h3>
              <p className="ui-type-meta text-muted-foreground">
                {t('Skills discovered from Claude, .agents, and .codex roots grouped by source.')}
              </p>
            </div>
            {groupBySourceScope(filteredSkills).map((group) => (
              <div key={group.scope} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" size="sm">
                    {t(group.scope)}
                  </Badge>
                  <span className="ui-type-meta text-muted-foreground">
                    {t('{{count}} items', { count: group.entries.length })}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.entries.map((item) => (
                    <CatalogCapabilityRow key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <div className="space-y-6">
            <section className="space-y-3" data-catalog-section="shared-mcp">
              <div className="space-y-1">
                <h3 className="ui-type-block-title">{t('Shared MCP')}</h3>
                <p className="ui-type-meta text-muted-foreground">
                  {t(
                    'Project and worktree MCP servers that can be projected into runtime workspaces.'
                  )}
                </p>
              </div>
              {groupBySourceScope(filteredSharedMcp).map((group) => (
                <div key={group.scope} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" size="sm">
                      {t(group.scope)}
                    </Badge>
                    <span className="ui-type-meta text-muted-foreground">
                      {t('{{count}} items', { count: group.entries.length })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.entries.map((item) => (
                      <CatalogMcpRow key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-3" data-catalog-section="personal-mcp">
              <div className="space-y-1">
                <h3 className="ui-type-block-title">{t('Personal MCP')}</h3>
                <p className="ui-type-meta text-muted-foreground">
                  {t('User-scope MCP servers discovered from Claude project settings.')}
                </p>
              </div>
              {groupBySourceScope(filteredPersonalMcp).map((group) => (
                <div key={group.scope} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" size="sm">
                      {t(group.scope)}
                    </Badge>
                    <span className="ui-type-meta text-muted-foreground">
                      {t('{{count}} items', { count: group.entries.length })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.entries.map((item) => (
                      <CatalogMcpRow key={item.id} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>

      <ClaudePolicyEditorDialog
        open={globalPolicyEditorOpen}
        onOpenChange={setGlobalPolicyEditorOpen}
        scope="global"
        globalPolicy={globalPolicy}
        repoPath={repoPath ?? ''}
        repoName={repoPath ? t('Current repository context') : t('All repositories')}
        projectPolicy={null}
        worktreePolicy={null}
        onSave={(nextPolicy, nextPreview) => {
          const changed = hasClaudePolicyConfigChanges(globalPolicy, nextPolicy);
          saveClaudeGlobalPolicy(nextPolicy as ClaudeGlobalPolicy | null);
          setGlobalPolicy(nextPolicy as ClaudeGlobalPolicy | null);
          setGlobalPreview(nextPreview);
          if (changed) {
            markClaudePolicyStaleGlobally();
          }
        }}
      />
    </section>
  );
}
