import { KanbanSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TodoPanelProps } from '@/components/todo/TodoPanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { useDeferredReady } from './useDeferredReady';

type TodoPanelComponent = React.ComponentType<TodoPanelProps>;

interface DeferredTodoPanelProps extends TodoPanelProps {
  shouldLoad?: boolean;
  onReady?: () => void;
}

export function DeferredTodoPanel({
  shouldLoad = true,
  onReady,
  ...props
}: DeferredTodoPanelProps) {
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

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...props} />;
  }

  return (
    <DeferredPanelFallback
      icon={<KanbanSquare className="h-5 w-5" />}
      eyebrow={t('Todo')}
      title={t('Loading tasks')}
      description={t('Preparing the kanban board')}
    />
  );
}
