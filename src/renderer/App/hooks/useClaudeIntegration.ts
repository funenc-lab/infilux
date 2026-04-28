import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settings';

export function useClaudeIntegration(activeWorktreePath: string | null, enabled = true) {
  const agentIntegration = useSettingsStore((s) => s.agentIntegration);

  // Sync Claude IDE Bridge with active worktree
  useEffect(() => {
    if (!enabled) {
      window.electronAPI.mcp.setEnabled(false);
      return;
    }

    if (agentIntegration.enabled) {
      const folders = activeWorktreePath ? [activeWorktreePath] : [];
      window.electronAPI.mcp.setEnabled(true, folders);
    } else {
      window.electronAPI.mcp.setEnabled(false);
    }
  }, [enabled, agentIntegration.enabled, activeWorktreePath]);

  // Sync Stop hook setting
  useEffect(() => {
    if (!enabled) {
      return;
    }
    window.electronAPI.mcp.setStopHookEnabled(agentIntegration.stopHookEnabled);
  }, [enabled, agentIntegration.stopHookEnabled]);

  // Sync Status Line hook setting
  useEffect(() => {
    if (!enabled) {
      return;
    }
    window.electronAPI.mcp.setStatusLineHookEnabled(agentIntegration.statusLineEnabled);
  }, [enabled, agentIntegration.statusLineEnabled]);

  // Sync PermissionRequest hook setting
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const setHook = window.electronAPI?.mcp?.setPermissionRequestHookEnabled;
    if (typeof setHook === 'function') {
      setHook(agentIntegration.permissionRequestHookEnabled);
      return;
    }

    console.warn(
      '[mcp] setPermissionRequestHookEnabled is not available. Please restart Electron dev process to update preload.'
    );
  }, [enabled, agentIntegration.permissionRequestHookEnabled]);
}
