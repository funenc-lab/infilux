import { useEffect } from 'react';
import { toastManager } from '@/components/ui/toast';
import { useI18n } from '@/i18n';
import {
  onTodoPersistenceFailure,
  type TodoPersistenceOperation,
} from '@/lib/todoPersistenceEvents';

const FAILURE_DESCRIPTION_BY_OPERATION: Record<TodoPersistenceOperation, string> = {
  add: 'Task creation failed. The local change was rolled back.',
  update: 'Task update failed. The local change was rolled back.',
  delete: 'Task deletion failed. The local change was restored.',
  move: 'Task move failed. The local change was rolled back.',
  reorder: 'Task reorder failed. The local order was restored.',
};

export function useTodoPersistenceNotifications(): void {
  const { t } = useI18n();

  useEffect(
    () =>
      onTodoPersistenceFailure((detail) => {
        const baseDescription = t(FAILURE_DESCRIPTION_BY_OPERATION[detail.operation]);
        const errorDetail = detail.errorMessage
          ? `\n${t('Details: {{message}}', { message: detail.errorMessage })}`
          : '';

        toastManager.add({
          title: t('Todo change was not saved'),
          description: `${baseDescription}${errorDetail}`,
          type: 'error',
          timeout: 10000,
        });
      }),
    [t]
  );
}
