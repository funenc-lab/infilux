export type TodoPersistenceOperation = 'add' | 'update' | 'delete' | 'move' | 'reorder';

export interface TodoPersistenceFailureDetail {
  operation: TodoPersistenceOperation;
  repoPath: string;
  errorMessage: string;
}

const TODO_PERSISTENCE_FAILURE_EVENT = 'infilux:todo-persistence-failure';

export function emitTodoPersistenceFailure(detail: TodoPersistenceFailureDetail): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<TodoPersistenceFailureDetail>(TODO_PERSISTENCE_FAILURE_EVENT, {
      detail,
    })
  );
}

export function onTodoPersistenceFailure(
  callback: (detail: TodoPersistenceFailureDetail) => void
): () => void {
  const handler = (event: Event) => {
    callback((event as CustomEvent<TodoPersistenceFailureDetail>).detail);
  };

  window.addEventListener(TODO_PERSISTENCE_FAILURE_EVENT, handler);
  return () => window.removeEventListener(TODO_PERSISTENCE_FAILURE_EVENT, handler);
}
