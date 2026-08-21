import { ChevronDown, Pencil, Plus } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ALL_GROUP_ID, type RepositoryGroup } from '@/App/constants';
import { useI18n } from '@/i18n';
import { focusFirstMenuItem, handleMenuNavigationKeyDown } from '@/lib/menuA11y';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const menuId = useId();

  const activeGroup = groups.find((g) => g.id === activeGroupId);
  const isAllSelected = activeGroupId === ALL_GROUP_ID;

  const displayEmoji = isAllSelected ? '' : activeGroup?.emoji || '';
  const displayName = isAllSelected ? t('All') : activeGroup?.name || t('All');

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      focusFirstMenuItem(menuRef.current);
      return;
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  const handleSelect = (groupId: string) => {
    onSelectGroup(groupId);
    setIsOpen(false);
  };

  return (
    <div className="px-0">
      <div className="control-sidebar-filter group relative">
        <button
          ref={triggerRef}
          type="button"
          aria-controls={menuId}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIsOpen(true);
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {displayEmoji && (
            <span className="w-4 shrink-0 text-center text-[14px]">{displayEmoji}</span>
          )}
          <span className="control-tree-title min-w-0 flex-1 truncate text-left">
            {displayName}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!isAllSelected) {
              onEditGroup();
            } else {
              onAddGroup();
            }
          }}
          className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent/12 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={isAllSelected ? t('New Group') : t('Edit Group')}
          title={isAllSelected ? t('New Group') : t('Edit Group')}
        >
          {isAllSelected ? <Plus className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
              role="presentation"
            />
            <div
              id={menuId}
              ref={menuRef}
              role="menu"
              aria-label={t('Group')}
              onKeyDown={(event) => handleMenuNavigationKeyDown(event, () => setIsOpen(false))}
              className="control-menu absolute left-0 right-0 top-full z-50 mt-1 rounded-md p-1"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => handleSelect(ALL_GROUP_ID)}
                className={cn(
                  'control-menu-item flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                  isAllSelected && 'bg-accent/12 text-foreground'
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
                  className="group/item flex w-full min-w-0 items-center rounded-md"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelect(group.id)}
                    className={cn(
                      'control-menu-item flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      group.id === activeGroupId && 'bg-accent/12 text-foreground'
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
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsOpen(false);
                      onSelectGroup(group.id);
                      onEditGroup();
                    }}
                    className="control-menu-item mr-1 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/item:opacity-100"
                    aria-label={`${t('Edit Group')}: ${group.name}`}
                    title={t('Edit Group')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <div className="my-1 h-px bg-border" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onAddGroup();
                }}
                className="control-menu-item flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
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
