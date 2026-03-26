import type {
  PersistentAgentHostKind,
  PersistentAgentRuntimeState,
  PersistentAgentSessionRecord,
} from '@shared/types';

export interface PersistentSessionHost {
  kind: PersistentAgentHostKind;
  probeSession(record: PersistentAgentSessionRecord): Promise<PersistentAgentRuntimeState>;
}
