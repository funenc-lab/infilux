import { KanbanSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TodoPanelProps } from '@/components/todo/TodoPanel';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { useI18n } from '@/i18n';

type TodoPanelComponent = React.ComponentType<TodoPanelProps>;

interface DeferredTodoPanelProps extends TodoPanelProps {
  shouldLoad?: boolean;
}

export function DeferredTodoPanel({ shouldLoad = true, ...props }: DeferredTodoPanelProps) {
  const { t } = useI18n();
  const [Component, setComponent] = useState<TodoPanelComponent | null>(null);

  useEffect(() => {
    if (!shouldLoad || Component) {
      return;
    }

    let cancelled = false;
    import('@/components/todo/TodoPanel').then((module) => {
      if (cancelled) {
        return;
      }
      setComponent(() => module.TodoPanel as TodoPanelComponent);
    });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad, Component]);

  if (Component) {
    return <Component {...props} />;
  }

  return (
    <Empty className="h-full border-0">
      <EmptyMedia variant="icon">
        <KanbanSquare className="h-4.5 w-4.5" />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{t('Loading tasks')}</EmptyTitle>
        <EmptyDescription>{t('Preparing the kanban board')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
