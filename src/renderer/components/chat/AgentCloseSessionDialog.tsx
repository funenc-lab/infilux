import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';

export interface PendingCloseSession {
  id: string;
  groupId?: string;
  name: string;
}

interface AgentCloseSessionDialogProps {
  pendingCloseSession: PendingCloseSession | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function AgentCloseSessionDialog({
  pendingCloseSession,
  onConfirm,
  onOpenChange,
}: AgentCloseSessionDialogProps) {
  const { t } = useI18n();

  if (!pendingCloseSession) {
    return null;
  }

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogPopup className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Close session')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('Stop "{{name}}" and remove it from this worktree view?', {
              name: pendingCloseSession.name,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline">{t('Cancel')}</Button>} />
          <AlertDialogClose
            render={
              <Button variant="destructive" onClick={onConfirm}>
                {t('Close session')}
              </Button>
            }
          />
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
