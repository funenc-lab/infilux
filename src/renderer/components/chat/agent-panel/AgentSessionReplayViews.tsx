import type { ComponentProps } from 'react';
import { useShallow } from 'zustand/shallow';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { AgentSessionTranscriptDrawer } from '../AgentSessionTranscriptDrawer';
import { AgentTerminal } from '../AgentTerminal';

type AgentTerminalWithReplayProps = Omit<ComponentProps<typeof AgentTerminal>, 'replaySnapshot'> & {
  id: string;
};

export function AgentTerminalWithReplay(props: AgentTerminalWithReplayProps) {
  const replaySnapshot = useAgentSessionsStore(
    (state) => state.sessions.find((session) => session.id === props.id)?.replaySnapshot
  );

  return <AgentTerminal {...props} replaySnapshot={replaySnapshot} />;
}

export function AgentSessionTranscriptDrawerWithReplay({
  open,
  session,
  ...props
}: ComponentProps<typeof AgentSessionTranscriptDrawer>) {
  const retainedReplay = useAgentSessionsStore(
    useShallow((state) => {
      const retainedSession =
        open && session
          ? state.sessions.find((candidate) => candidate.id === session.id)
          : undefined;
      return {
        replaySnapshot: retainedSession?.replaySnapshot,
        replaySnapshotCapturedAt: retainedSession?.replaySnapshotCapturedAt,
      };
    })
  );

  return (
    <AgentSessionTranscriptDrawer
      {...props}
      open={open}
      session={session ? { ...session, ...retainedReplay } : null}
    />
  );
}
