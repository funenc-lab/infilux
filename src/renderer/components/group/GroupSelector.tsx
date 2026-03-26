import { ChevronDown, Pencil, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { ALL_GROUP_ID, type RepositoryGroup } from '@/App/constants';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

interface GroupSelectorProps {
  groups: RepositoryGroup[];
  activeGroupId: string;
  repositoryCounts: Record<string, number>;
  totalCount: number;
  onSelectGroup: (groupId: string) => void;
  onEditGroup: () => void;
  onAddGroup: () => void;
}

export function GroupSelector({
  groups,
  activeGroupId,
  repositoryCounts,
  totalCount,
  onSelectGroup,
  onEditGroup,
  onAddGroup,
}: GroupSelectorProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const isAllSelected = activeGroupId === ALL_GROUP_ID;

  const displayEmoji = isAllSelected ? '' : activeGroup?.emoji || '';
  const displayName = isAllSelected ? t('All') : activeGroup?.name || t('All');
  const displayCount = isAllSelected ? totalCount : repositoryCounts[activeGroupId] || 0;

  const handleSelect = (groupId: string) => {
    onSelectGroup(groupId);
    setIsOpen(false);
  };

  return (
    <div className="px-0">
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className="control-sidebar-filter group relative cursor-pointer"
      >
        {displayEmoji && (
          <span className="w-4 shrink-0 text-center text-[14px]">{displayEmoji}</span>
        )}
        {!isAllSelected && (
          <span
            className="h-2 w-2 shrink-0 rounded-full border"
            style={{ backgroundColor: activeGroup?.color }}
            aria-hidden="true"
          />
        )}
        <span className="control-tree-title min-w-0 flex-1 truncate text-left">{displayName}</span>
        <span className="control-tree-meta shrink-0 font-medium uppercase tabular-nums">
          {displayCount}
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            isOpen && 'rotate-180'
          )}
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!isAllSelected) {
              onEditGroup();
            } else {
              onAddGroup();
            }
          }}
          className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent/12 hover:text-foreground group-hover:opacity-100"
          title={isAllSelected ? t('New Group') : t('Edit Group')}
        >
          {isAllSelected ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
              onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
              role="presentation"
            />
            <div
              ref={menuRef}
              className="control-menu absolute left-0 right-0 top-full z-50 mt-1 rounded-md p-1"
            >
              <button
                type="button"
                onClick={() => handleSelect(ALL_GROUP_ID)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  'hover:bg-accent/28'
                )}
              >
                <span className="min-w-0 flex-1 truncate text-left">{t('All')}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {totalCount}
                </span>
              </button>

              {groups.length > 0 && <div className="my-1 h-px bg-border" />}

              {groups.map((group) => (
                <div
                  key={group.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelect(group.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelect(group.id);
                    }
                  }}
                  className={cn(
                    'group/item flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    'hover:bg-accent/28'
                  )}
                >
                  <span className="text-[15px]">{group.emoji}</span>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border"
                    style={{ backgroundColor: group.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {repositoryCounts[group.id] || 0}
                  </span>
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                      onSelectGroup(group.id);
                      onEditGroup();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation();
                        setIsOpen(false);
                        onSelectGroup(group.id);
                        onEditGroup();
                      }
                    }}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-foreground"
                    title={t('Edit Group')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <div className="my-1 h-px bg-border" />

              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddGroup();
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent/28 hover:text-foreground"
              >
                <Plus className="h-4 w-4" />
                <span>{t('New Group')}</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
