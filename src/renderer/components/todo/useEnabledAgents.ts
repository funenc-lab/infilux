import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useSettingsStore } from '@/stores/settings';
import { type ResolvedAgent, resolveAgent } from './agentResolution';

export { resolveAgent, type ResolvedAgent };

/** Hook that returns the list of enabled & installed agents, sorted with default first */
export function useEnabledAgents(): ResolvedAgent[] {
  const { agentSettings, agentDetectionStatus, customAgents, hapiSettings } = useSettingsStore(
    useShallow((state) => ({
      agentSettings: state.agentSettings,
      agentDetectionStatus: state.agentDetectionStatus,
      customAgents: state.customAgents,
      hapiSettings: state.hapiSettings,
    }))
  );
  const [installedAgents, setInstalledAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    const enabledAgentIds = Object.keys(agentSettings).filter((id) => agentSettings[id]?.enabled);
    const next = new Set<string>();

    for (const id of enabledAgentIds) {
      if (agentSettings[id]?.isDefault) {
        next.add(id);
        continue;
      }
      if (id.endsWith('-hapi')) {
        if (!hapiSettings.enabled) continue;
        const baseId = id.slice(0, -5);
        if (agentDetectionStatus[baseId]?.installed) next.add(id);
        continue;
      }
      if (id.endsWith('-happy')) {
        const baseId = id.slice(0, -6);
        if (agentDetectionStatus[baseId]?.installed) next.add(id);
        continue;
      }
      if (agentDetectionStatus[id]?.installed) next.add(id);
    }

    setInstalledAgents(next);
  }, [agentSettings, agentDetectionStatus, hapiSettings.enabled]);

  return useMemo(() => {
    const ids = Object.keys(agentSettings).filter((id) => {
      if (!agentSettings[id]?.enabled || !installedAgents.has(id)) return false;
      if (id.endsWith('-hapi') && !hapiSettings.enabled) return false;
      return true;
    });

    return ids
      .map((id) => resolveAgent(id, agentSettings, customAgents))
      .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
  }, [agentSettings, customAgents, installedAgents, hapiSettings.enabled]);
}
