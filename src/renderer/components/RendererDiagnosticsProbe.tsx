import { useEffect, useRef } from 'react';
import {
  getAppMemoryPressureBucket,
  getRendererDiagnosticsSnapshot,
  getRendererMemoryPressureBucket,
  recordRuntimeMemorySample,
  updateRendererDiagnostics,
} from '@/lib/runtimeDiagnostics';
import { useAgentSessionsStore } from '@/stores/agentSessions';
import { useEditorStore } from '@/stores/editor';
import { useSettingsStore } from '@/stores/settings';
import { useTerminalStore } from '@/stores/terminal';

const RUNTIME_MEMORY_SAMPLE_INTERVAL_MS = 20_000;

export function RendererDiagnosticsProbe(): null {
  const agentSessionCount = useAgentSessionsStore((state) => state.sessions.length);
  const terminalSessionCount = useTerminalStore((state) => state.sessions.length);
  const terminalScrollback = useSettingsStore((state) => state.terminalScrollback);
  const editorTabCount = useEditorStore((state) => state.tabs.length);
  const activeEditorPath = useEditorStore((state) => state.activeTabPath);
  const loggedRuntimeMemoryErrorRef = useRef(false);
  const lastLoggedRendererPressureBucketRef = useRef<number | null>(null);
  const lastLoggedAppPressureBucketRef = useRef<number | null>(null);

  useEffect(() => {
    updateRendererDiagnostics({
      agentSessionCount,
      terminalSessionCount,
      configuredTerminalScrollback: terminalScrollback,
      estimatedTerminalScrollbackLineCapacity: terminalSessionCount * terminalScrollback,
      editorTabCount,
      activeEditorPath,
    });
  }, [
    activeEditorPath,
    agentSessionCount,
    editorTabCount,
    terminalScrollback,
    terminalSessionCount,
  ]);

  useEffect(() => {
    let cancelled = false;

    const sampleRuntimeMemory = async () => {
      try {
        const memorySnapshot = await window.electronAPI.app.getRuntimeMetrics();
        if (cancelled) {
          return;
        }
        recordRuntimeMemorySample(memorySnapshot);

        const rendererPressureBucket = getRendererMemoryPressureBucket(memorySnapshot);
        if (
          rendererPressureBucket !== null &&
          rendererPressureBucket >= 1 &&
          rendererPressureBucket > (lastLoggedRendererPressureBucketRef.current ?? -1)
        ) {
          lastLoggedRendererPressureBucketRef.current = rendererPressureBucket;
          console.warn('[renderer-diagnostics] Renderer memory pressure increased', {
            diagnostics: getRendererDiagnosticsSnapshot(),
            rendererPressureBucket,
          });
        }

        const appPressureBucket = getAppMemoryPressureBucket(memorySnapshot);
        if (
          appPressureBucket !== null &&
          appPressureBucket >= 4 &&
          appPressureBucket > (lastLoggedAppPressureBucketRef.current ?? -1)
        ) {
          lastLoggedAppPressureBucketRef.current = appPressureBucket;
          console.warn('[renderer-diagnostics] App memory pressure increased', {
            appPressureBucket,
            diagnostics: getRendererDiagnosticsSnapshot(),
          });
        }
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
