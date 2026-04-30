import { KanbanSquare } from 'lucide-react';
import type { TodoPanelProps } from '@/components/todo/TodoPanel';
import { useI18n } from '@/i18n';
import { DeferredPanelFallback } from './DeferredPanelFallback';
import { DeferredPanelLoadError } from './DeferredPanelLoadError';
import { useDeferredComponentLoader } from './useDeferredComponentLoader';
import { useDeferredReady } from './useDeferredReady';

type TodoPanelComponent = React.ComponentType<TodoPanelProps>;
type TodoPanelModule = typeof import('@/components/todo/TodoPanel');

function loadTodoPanelModule(): Promise<TodoPanelModule> {
  return import('@/components/todo/TodoPanel');
}

function selectTodoPanelComponent(module: TodoPanelModule): TodoPanelComponent {
  return module.TodoPanel as TodoPanelComponent;
}

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
  const { Component, error, retry } = useDeferredComponentLoader<TodoPanelModule, TodoPanelProps>({
    shouldLoad,
    load: loadTodoPanelModule,
    selectComponent: selectTodoPanelComponent,
    errorLabel: 'TodoPanel',
  });

  useDeferredReady(Boolean(Component), onReady);

  if (Component) {
    return <Component {...props} />;
  }

  if (error) {
    return (
      <DeferredPanelLoadError
        eyebrow={t('Todo')}
        title={t('Unable to load tasks')}
        description={t('Unable to load resources.')}
        error={error}
        onRetry={retry}
      />
    );
  }

  return (
    <DeferredPanelFallback
      icon={<KanbanSquare className="h-5 w-5" />}
      eyebrow={t('Todo')}
      title={t('Task board')}
      description={t('Loading tasks')}
    />
  );
}
