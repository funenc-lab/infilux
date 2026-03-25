import { useEffect, useRef } from 'react';
import { recordRuntimeMemorySample, updateRendererDiagnostics } from '@/lib/runtimeDiagnostics';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useEditorStore } from '@/stores/editor';
import { useTerminalStore } from '@/stores/terminal';

const RUNTIME_MEMORY_SAMPLE_INTERVAL_MS = 20_000;

export function RendererDiagnosticsProbe(): null {
  const agentSessionCount = useAgentSessionsStore((state) => state.sessions.length);
  const terminalSessionCount = useTerminalStore((state) => state.sessions.length);
  const editorTabCount = useEditorStore((state) => state.tabs.length);
  const activeEditorPath = useEditorStore((state) => state.activeTabPath);
  const loggedRuntimeMemoryErrorRef = useRef(false);

  useEffect(() => {
    updateRendererDiagnostics({
      agentSessionCount,
      terminalSessionCount,
      editorTabCount,
      activeEditorPath,
    });
  }, [activeEditorPath, agentSessionCount, editorTabCount, terminalSessionCount]);

  useEffect(() => {
    let cancelled = false;

    const sampleRuntimeMemory = async () => {
      try {
        const memorySnapshot = await window.electronAPI.app.getRuntimeMetrics();
        if (cancelled) {
          return;
        }
        recordRuntimeMemorySample(memorySnapshot);
      } catch (error) {
        if (!loggedRuntimeMemoryErrorRef.current) {
          console.warn('[renderer-diagnostics] Failed to sample runtime memory', error);
          loggedRuntimeMemoryErrorRef.current = true;
        }
      }
    };

    void sampleRuntimeMemory();
    const timer = window.setInterval(() => {
      void sampleRuntimeMemory();
    }, RUNTIME_MEMORY_SAMPLE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
