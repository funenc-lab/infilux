import { KanbanSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TodoPanelProps } from '@/components/todo/TodoPanel';
import { useI18n } from '@/i18n';
import { ControlStateCard } from './ControlStateCard';

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
    <ControlStateCard
      icon={<KanbanSquare className="h-5 w-5" />}
      eyebrow={t('Todo')}
      title={t('Loading tasks')}
      description={t('Preparing the kanban board')}
      chipLabel={t('Todo')}
      chipTone="wait"
    />
  );
}
