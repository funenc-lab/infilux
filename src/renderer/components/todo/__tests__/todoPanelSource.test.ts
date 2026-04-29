import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourcePath = resolve(__dirname, '../TodoPanel.tsx');
const source = readFileSync(sourcePath, 'utf8');

describe('TodoPanel source policy', () => {
  it('loads the global todo project index for the decision center', () => {
    expect(source).toContain('const loadAllProjects = useTodoStore');
    expect(source).toContain('void loadAllProjects();');
    expect(source).toContain('[loadAllProjects]');
  });

  it('wires the decision center to global auto-execute dispatch and stop handling', () => {
    expect(source).toContain('useEnabledAgents()');
    expect(source).toContain('startTodoGlobalAutoExecute');
    expect(source).toContain('handleTodoAutoExecuteStop');
    expect(source).toContain('onDispatchReadyTasks={handleDispatchReadyTasks}');
    expect(source).toContain('canDispatchReadyTasks={canDispatchReadyTasks}');
  });

  it('wires global intervention actions to approval updates and task focus requests', () => {
    expect(source).toContain('buildApprovedTodoTaskContext');
    expect(source).toContain('const updateTask = useTodoStore');
    expect(source).toContain('const [focusTaskRequest, setFocusTaskRequest]');
    expect(source).toContain('const handleApproveGlobalTask = useCallback');
    expect(source).toContain('const handleFocusGlobalTask = useCallback');
    expect(source).toContain('onApproveTask={handleApproveGlobalTask}');
    expect(source).toContain('onFocusTask={handleFocusGlobalTask}');
    expect(source).toContain('focusTaskRequest={focusTaskRequest}');
    expect(source).toContain('onSwitchRepository?.(repoKey);');
  });
});
