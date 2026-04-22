import type { AgentStopNotificationData } from '@shared/types/agent';
import { useEffect, useRef } from 'react';
import { normalizePath, pathsEqual } from '@/App/storage';
import { supportsAgentNativeTerminalInput } from '@/components/chat/agentInputMode';
import type { Session } from '@/components/chat/SessionBar';
import { useI18n } from '@/i18n';
import {
  onAgentStopNotification,
  onAskUserQuestionNotification,
  onNotificationClick,
  onPreToolUseNotification,
  showRendererNotification,
} from '@/lib/electronNotification';
import { buildChatNotificationCopy } from '@/lib/feedbackCopy';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useSettingsStore } from '@/stores/settings';
import { useWorktreeActivityStore } from '@/stores/worktreeActivity';
import type { TabId } from '../constants';

interface UseAgentSessionNotificationsOptions {
  activeTab: TabId;
  activeWorktreePath: string | null;
  hasSelectedSubagent: boolean;
  onRequestCanvasFocus: (worktreePath: string, sessionId: string) => void;
  onSwitchWorktreePath: (worktreePath: string) => Promise<void> | void;
}

interface ActiveAgentViewState {
  activeTab: TabId;
  activeWorktreePath: string | null;
  hasSelectedSubagent: boolean;
}

const AGENT_NOTIFICATION_NAME_BY_ID: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  droid: 'Droid',
  gemini: 'Gemini',
  auggie: 'Auggie',
  cursor: 'Cursor',
  opencode: 'OpenCode',
};

function getNotificationAgentName(session: Session): string {
  const baseAgentId = session.agentId.replace(/-(hapi|happy)$/, '');
  return AGENT_NOTIFICATION_NAME_BY_ID[baseAgentId] ?? session.agentCommand;
}

function findSessionByNotificationId(incomingSessionId: string): Session | undefined {
  return useAgentSessionsStore
    .getState()
    .sessions.find(
      (session) => session.id === incomingSessionId || session.sessionId === incomingSessionId
    );
}

function isSessionCurrentlyVisible(session: Session, activeView: ActiveAgentViewState): boolean {
  if (activeView.activeTab !== 'chat' || activeView.hasSelectedSubagent) {
    return false;
  }

  if (!activeView.activeWorktreePath || !pathsEqual(activeView.activeWorktreePath, session.cwd)) {
    return false;
  }

  const sessionStoreState = useAgentSessionsStore.getState();
  const normalizedCwd = normalizePath(session.cwd);
  const activeSessionId = sessionStoreState.activeIds[normalizedCwd];
  if (activeSessionId) {
    return activeSessionId === session.id;
  }

  const groupState = sessionStoreState.groupStates[normalizedCwd];
  if (!groupState?.activeGroupId) {
    return false;
  }

  const activeGroup = groupState.groups.find((group) => group.id === groupState.activeGroupId);
  return activeGroup?.activeSessionId === session.id;
}

function resolveQuestionPreview(toolInput: unknown, fallback: string): string {
  if (!toolInput || typeof toolInput !== 'object' || !('questions' in toolInput)) {
    return fallback;
  }

  const candidateQuestions = (toolInput as { questions?: Array<{ question?: string }> }).questions;
  return candidateQuestions?.[0]?.question || fallback;
}

function resolveNotificationCwd(incomingCwd: string | undefined, sessionId: string): string | null {
  if (incomingCwd) {
    return incomingCwd;
  }

  const session = findSessionByNotificationId(sessionId);
  return session?.cwd ?? null;
}

export function useAgentSessionNotifications({
  activeTab,
  activeWorktreePath,
  hasSelectedSubagent,
  onRequestCanvasFocus,
  onSwitchWorktreePath,
}: UseAgentSessionNotificationsOptions) {
  const { t } = useI18n();
  const activeViewRef = useRef<ActiveAgentViewState>({
    activeTab,
    activeWorktreePath,
    hasSelectedSubagent,
  });
  const requestCanvasFocusRef = useRef(onRequestCanvasFocus);
  const switchWorktreePathRef = useRef(onSwitchWorktreePath);
  const translateRef = useRef(t);

  useEffect(() => {
    activeViewRef.current = {
      activeTab,
      activeWorktreePath,
      hasSelectedSubagent,
    };
  }, [activeTab, activeWorktreePath, hasSelectedSubagent]);

  useEffect(() => {
    requestCanvasFocusRef.current = onRequestCanvasFocus;
  }, [onRequestCanvasFocus]);

  useEffect(() => {
    switchWorktreePathRef.current = onSwitchWorktreePath;
  }, [onSwitchWorktreePath]);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

  useEffect(() => {
    const unsubscribeNotificationClick = onNotificationClick((notificationSessionId) => {
      const session = findSessionByNotificationId(notificationSessionId);
      if (!session) {
        return;
      }

      useAgentSessionsStore.getState().focusSession(session.id);

      const activeView = activeViewRef.current;
      if (activeView.activeTab === 'chat' && !activeView.hasSelectedSubagent) {
        requestCanvasFocusRef.current(session.cwd, session.id);
      }

      if (activeView.activeWorktreePath && pathsEqual(activeView.activeWorktreePath, session.cwd)) {
        return;
      }

      void Promise.resolve(switchWorktreePathRef.current(session.cwd)).catch((error) => {
        console.error(
          '[useAgentSessionNotifications] Failed to switch worktree from notification',
          error
        );
      });
    });

    const unsubscribeStop = onAgentStopNotification(
      ({ sessionId, taskCompletionStatus }: AgentStopNotificationData) => {
        const session = findSessionByNotificationId(sessionId);
        if (!session) {
          return;
        }

        const activeView = activeViewRef.current;
        const isViewingSession = isSessionCurrentlyVisible(session, activeView);
        const agentSessionsStore = useAgentSessionsStore.getState();

        agentSessionsStore.setWaitingForInput(session.id, false);
        agentSessionsStore.setOutputState(session.id, 'idle', isViewingSession);

        if (taskCompletionStatus === 'completed' && !isViewingSession) {
          agentSessionsStore.markTaskCompletedUnread(session.id);
        }

        const claudeCodeIntegration = useSettingsStore.getState().claudeCodeIntegration;
        const activityState = useWorktreeActivityStore.getState().getActivityState(session.cwd);
        const shouldAutoPopup =
          session.agentId === 'claude' &&
          !supportsAgentNativeTerminalInput(session.agentId) &&
          claudeCodeIntegration.enhancedInputEnabled &&
          (claudeCodeIntegration.enhancedInputAutoPopup === 'always' ||
            claudeCodeIntegration.enhancedInputAutoPopup === 'hideWhileRunning') &&
          claudeCodeIntegration.stopHookEnabled &&
          activityState !== 'waiting_input';

        if (shouldAutoPopup) {
          agentSessionsStore.setEnhancedInputOpen(session.id, true);
        }

        const projectName = session.cwd.split('/').pop() || 'Unknown';
        const notificationCopy = buildChatNotificationCopy(
          {
            action: 'command-completed',
            command: getNotificationAgentName(session),
            body: session.terminalTitle || projectName,
          },
          translateRef.current
        );

        void showRendererNotification({
          title: notificationCopy.title,
          body: notificationCopy.body,
          sessionId: session.id,
        });
      }
    );

    const unsubscribeAskUserQuestion = onAskUserQuestionNotification(({ sessionId, toolInput }) => {
      const session = findSessionByNotificationId(sessionId);
      if (!session) {
        return;
      }

      useAgentSessionsStore.getState().setWaitingForInput(session.id, true);
      const questionPreview = resolveQuestionPreview(
        toolInput,
        translateRef.current('User response required')
      );
      const notificationCopy = buildChatNotificationCopy(
        {
          action: 'waiting-input',
          command: getNotificationAgentName(session),
          preview: questionPreview,
        },
        translateRef.current
      );

      void showRendererNotification({
        title: notificationCopy.title,
        body: notificationCopy.body,
        sessionId: session.id,
      });
    });

    const unsubscribePreToolUse = onPreToolUseNotification(({ sessionId, toolName, cwd }) => {
      if (toolName !== 'UserPromptSubmit') {
        return;
      }

      const resolvedCwd = resolveNotificationCwd(cwd, sessionId);
      if (!resolvedCwd) {
        return;
      }

      const session = findSessionByNotificationId(sessionId);
      if (!session || !pathsEqual(session.cwd, resolvedCwd)) {
        return;
      }

      useAgentSessionsStore.getState().setWaitingForInput(session.id, false);
    });

    return () => {
      unsubscribeNotificationClick();
      unsubscribeStop();
      unsubscribeAskUserQuestion();
      unsubscribePreToolUse();
    };
  }, []);
}
