import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const agentPanelSource = readFileSync(resolve(currentDir, '../AgentPanel.tsx'), 'utf8');

describe('AgentPanel canvas mode source', () => {
  it('reads the persisted display mode and keeps a single AgentTerminal mount tree', () => {
    expect(agentPanelSource).toContain('canvasFocusOnActivateToken');
    expect(agentPanelSource).toContain('canvasFocusSessionId');
    expect(agentPanelSource).toContain('lastHandledCanvasFocusRequestTokenRef');
    expect(agentPanelSource).toContain('agentSessionDisplayMode');
    expect(agentPanelSource).toContain("agentSessionDisplayMode === 'canvas'");
    expect(agentPanelSource).toContain("agentSessionDisplayMode === 'global-canvas'");
    expect(agentPanelSource).toContain('isCurrentWorktreePanel');
    expect(agentPanelSource).toContain('shouldSuppressWorkspaceCanvasPanel');
    expect(agentPanelSource).toContain('isWorkspaceCanvasDisplayMode');
    expect(agentPanelSource).toContain('resolveAgentCanvasSessionGroups');
    expect(agentPanelSource).toContain('resolveMountedAgentPanelSessionIds');
    expect(agentPanelSource).toContain(
      "scope: isWorkspaceCanvasDisplayMode ? 'workspace' : 'worktree'"
    );
    expect(agentPanelSource).toContain('canvasSessionGroups');
    expect(agentPanelSource).toContain('canvasSessions');
    expect(agentPanelSource).toContain('workspaceCanvasWorktrees');
    expect(agentPanelSource).toContain('subagentScopeSessions');
    expect(agentPanelSource).toContain(
      'suppressSessionMounting: shouldSuppressWorkspaceCanvasPanel'
    );
    expect(agentPanelSource).toContain(
      'isWorkspaceCanvasDisplayMode ? canvasSessions : currentWorktreeSessions'
    );
    expect(agentPanelSource).toContain('subagentScopeWorktreePaths');
    expect(agentPanelSource).toContain('workspaceCanvasFocusedSessionId');
    expect(agentPanelSource).toContain('AGENT_CANVAS_GRID_COLUMN_UNITS');
    expect(agentPanelSource).toContain('resolveAgentCanvasColumnCount');
    expect(agentPanelSource).toContain('resolveAgentCanvasTileColumnSpan');
    expect(agentPanelSource).toContain('resolveAgentCanvasWorkspaceColumnCount');
    expect(agentPanelSource).toContain('resolveAgentCanvasWorkspaceGroupColumnSpan');
    expect(agentPanelSource).toContain('AGENT_CANVAS_WORKSPACE_TILE_ROW_SIZE');
    expect(agentPanelSource).toContain('AGENT_CANVAS_WORKSPACE_EMPTY_GROUP_HEIGHT');
    expect(agentPanelSource).toContain('resolveAgentCanvasViewportMetrics');
    expect(agentPanelSource).toContain('canvasViewportRef');
    expect(agentPanelSource).toContain('canvasPanStateRef');
    expect(agentPanelSource).toContain('handleCanvasViewportPointerDown');
    expect(agentPanelSource).toContain('handleCanvasViewportPointerMove');
    expect(agentPanelSource).toContain('shouldStartAgentCanvasPan');
    expect(agentPanelSource).toContain('AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE');
    expect(agentPanelSource).toContain('requestAnimationFrame');
    expect(agentPanelSource).toContain('scrollLeft');
    expect(agentPanelSource).toContain('scrollTop');
    expect(agentPanelSource).toContain("event.code === 'Space'");
    expect(agentPanelSource).toContain('canvasFloatingSessionId');
    expect(agentPanelSource).toContain('setCanvasFloatingSessionIdForCurrentWorktree');
    expect(agentPanelSource).toContain('handleOpenCanvasFloatingSession');
    expect(agentPanelSource).toContain('handleCloseCanvasFloatingSession');
    expect(agentPanelSource).toContain('resolveAgentCanvasFloatingFrame');
    expect(agentPanelSource).toContain('resolveAgentCanvasFloatingTerminalFontScale');
    expect(agentPanelSource).toContain('resolveAgentCanvasFocusScrollPosition');
    expect(agentPanelSource).toContain('resolveAgentCanvasElementFocusTarget');
    expect(agentPanelSource).toContain('resolveAgentCanvasScrollBehavior');
    expect(agentPanelSource).toContain('useAgentCanvasViewportRestore');
    expect(agentPanelSource).toContain('resolveAgentCanvasViewportSyncPosition');
    expect(agentPanelSource).toContain('resolveAgentCanvasZoomTerminalFontScale');
    expect(agentPanelSource).toContain('createPortal');
    expect(agentPanelSource).toContain('CanvasSessionContentOutlet');
    expect(agentPanelSource).toContain('canvasSessionContentHostByIdRef');
    expect(agentPanelSource).toContain('canvasViewportRestoreReadyWorktreeKeyRef');
    expect(agentPanelSource).toContain(
      'canvasViewportRestoreReadyWorktreeKeyRef.current !== canvasZoomStorageKey'
    );
    expect(agentPanelSource).toContain('canvasViewportRestoreReadyWorktreeKeyRef.current = null');
    expect(agentPanelSource).toContain(
      'canvasViewportRestoreReadyWorktreeKeyRef.current = canvasZoomStorageKey'
    );
    expect(agentPanelSource).toContain('ensureCanvasSessionContentHost');
    expect(agentPanelSource).toContain('createPortal(sessionPanelContent, sessionContentHost)');
    expect(agentPanelSource).not.toContain('createPortal(sessionPanelContent, document.body)');
    expect(agentPanelSource).toContain("import { useShallow } from 'zustand/shallow'");
    expect(agentPanelSource).toContain('Maximize2');
    expect(agentPanelSource).toContain('Minimize2');
    expect(agentPanelSource).toContain("t('Bring to Front')");
    expect(agentPanelSource).toContain("t('Dismiss Floating Session')");
    expect(agentPanelSource).toContain('data-agent-canvas-floating');
    expect(agentPanelSource).toContain('data-agent-canvas-header');
    expect(agentPanelSource).toContain('no-drag');
    expect(agentPanelSource).toContain('fixed z-30 flex flex-col overflow-hidden');
    expect(agentPanelSource).toContain(
      'control-panel-muted pointer-events-auto relative z-20 flex shrink-0 items-start'
    );
    expect(agentPanelSource).toContain('canvasZoomTerminalFontScale');
    expect(agentPanelSource).toContain('terminalFontScale');
    expect(agentPanelSource).toContain('canvasTileColumnSpanBySessionId');
    expect(agentPanelSource).toContain('const groupColumnCount = isWorkspaceCanvasDisplayMode');
    expect(agentPanelSource).toContain('workspaceCanvasSessionGroupSections');
    expect(agentPanelSource).toContain('canvasRecenterWorktreePath');
    expect(agentPanelSource).toContain('lastHandledWorkspaceCanvasRecenterTokenRef');
    expect(agentPanelSource).toContain('canvasWorktreeGroupElementByKeyRef');
    expect(agentPanelSource).toContain('setCanvasWorktreeGroupElement');
    expect(agentPanelSource).toContain('readCanvasWorktreeGroupFocusTarget');
    expect(agentPanelSource).toContain('focusCanvasViewportOnWorktreeGroup');
    expect(agentPanelSource).toContain('buildAgentCanvasSessionGroupKey');
    expect(agentPanelSource).toContain('data-agent-canvas-repo-path');
    expect(agentPanelSource).toContain('data-agent-canvas-worktree-path');
    expect(agentPanelSource).toContain('type AgentSessionLaunchTarget');
    expect(agentPanelSource).toContain('resolveAgentSessionLaunchTarget');
    expect(agentPanelSource).toContain('const groupLaunchTarget: AgentSessionLaunchTarget');
    expect(agentPanelSource).toContain("t('New Session in {{name}}'");
    expect(agentPanelSource).toContain('handleNewSession(groupLaunchTarget)');
    expect(agentPanelSource).toContain(
      `            <div
              {...{ [AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE]: 'true' }}
              className={cn(
                'control-panel-muted flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2'`
    );
    expect(agentPanelSource).toContain(
      'const groupColumnSpan = resolveAgentCanvasWorkspaceGroupColumnSpan'
    );
    expect(agentPanelSource).toContain(
      'className="flex min-w-0 flex-none scroll-mt-3 flex-col gap-2"'
    );
    expect(agentPanelSource).toContain(
      `style={{ gridColumn: \`span \${groupColumnSpan} / span \${groupColumnSpan}\` }}`
    );
    expect(agentPanelSource).toContain('gridAutoRows:');
    expect(agentPanelSource).toContain('? AGENT_CANVAS_WORKSPACE_TILE_ROW_SIZE');
    expect(agentPanelSource).toContain('AGENT_CANVAS_WORKSPACE_EMPTY_GROUP_HEIGHT}px');
    expect(agentPanelSource).toContain(
      'style={{ minHeight: AGENT_CANVAS_WORKSPACE_EMPTY_GROUP_HEIGHT }}'
    );
    expect(agentPanelSource).toContain(
      `                <div
                  {...{ [AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE]: 'true' }}
                  className="control-panel-muted col-span-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground"`
    );
    expect(agentPanelSource).toContain("t('No agent sessions')");
    expect(agentPanelSource).toContain(
      'recenterOnActivateToken: isWorkspaceCanvasDisplayMode ? 0 : canvasRecenterOnActivateToken'
    );
    expect(agentPanelSource).toContain("t('Current Worktree')");
    expect(agentPanelSource).toContain("t('{{count}} agent sessions'");
    expect(agentPanelSource).toContain('getDisplayPathBasename(session.cwd)');
    expect(agentPanelSource).toContain('getDisplayPathBasename(session.repoPath)');
    expect(agentPanelSource).toContain('<GitBranch className="h-3.5 w-3.5 shrink-0" />');
    expect(agentPanelSource).toContain(
      'repoPath={isWorkspaceCanvasDisplayMode ? session.repoPath : repoPath}'
    );
    expect(agentPanelSource).toContain(
      `gridColumn: \`span \${canvasTileColumnSpan} / span \${canvasTileColumnSpan}\``
    );
    expect(agentPanelSource).toContain(
      "isWorkspaceCanvasDisplayMode ? 'min-h-full w-full' : 'h-full w-full'"
    );
    expect(agentPanelSource).toContain(
      "isWorkspaceCanvasDisplayMode ? 'grid auto-rows-max' : 'grid'"
    );
    expect(agentPanelSource).toContain('handleCanvasViewportWheel');
    expect(agentPanelSource).toContain('canvasLockedByWorktree');
    expect(agentPanelSource).toContain('isCanvasLocked');
    expect(agentPanelSource).toContain('setCanvasLockedByWorktree');
    expect(agentPanelSource).toContain('handleToggleCanvasLock');
    expect(agentPanelSource).toContain("t('Lock Canvas')");
    expect(agentPanelSource).toContain("t('Unlock Canvas')");
    expect(agentPanelSource).toContain('Lock');
    expect(agentPanelSource).toContain('LockOpen');
    expect(agentPanelSource).toContain('canvasSessionGroups.length > 0');
    expect(agentPanelSource).toContain("t('Zoom Out')");
    expect(agentPanelSource).toContain("t('Reset Zoom')");
    expect(agentPanelSource).toContain("t('Zoom In')");
    expect(agentPanelSource).toContain("t('Center')");
    expect(agentPanelSource).toContain('handleCenterCanvasViewport');
    expect(agentPanelSource).toContain('onClick={handleCenterCanvasViewport}');
    expect(agentPanelSource).toContain("aria-label={t('Quick Terminal')}");
    expect(agentPanelSource).toContain('<Terminal className="h-4 w-4" />');
    expect(agentPanelSource).toContain(
      'const globalNewSessionLabel = isWorkspaceCanvasDisplayMode'
    );
    expect(agentPanelSource).toContain("t('New in Current Worktree')");
    expect(agentPanelSource).toContain("t('Choose session agent')");
    expect(agentPanelSource).toContain("t('Select Agent')");
    expect(agentPanelSource).toContain("t('Agent profiles')");
    expect(agentPanelSource).toContain('MenuTrigger');
    expect(agentPanelSource).toContain('MenuPopup');
    expect(agentPanelSource).toContain('MenuItem');
    expect(agentPanelSource).toContain('emptyStateProfiles.map((profile) =>');
    expect(agentPanelSource).toContain(
      'handleNewSessionWithAgent(profile.agentId, profile.command)'
    );
    expect(agentPanelSource).toContain('const renderSessionHeaderSummary = () => (');
    expect(agentPanelSource).toContain('flex min-w-0 items-center gap-2');
    expect(agentPanelSource).toContain('control-chip shrink-0 max-w-[34%] gap-1.5 truncate');
    expect(agentPanelSource).toContain(
      "isWorkspaceCanvasDisplayMode ? 'max-w-[30%]' : 'max-w-[45%]'"
    );
    expect(agentPanelSource).toContain('function renderAgentLabelIcon(agentId: string)');
    expect(agentPanelSource).toContain("case 'claude':");
    expect(agentPanelSource).toContain('<Sparkles className="h-3.5 w-3.5 shrink-0" />');
    expect(agentPanelSource).toContain("case 'codex':");
    expect(agentPanelSource).toContain('<Braces className="h-3.5 w-3.5 shrink-0" />');
    expect(agentPanelSource).toContain("case 'gemini':");
    expect(agentPanelSource).toContain('<Diamond className="h-3.5 w-3.5 shrink-0" />');
    expect(agentPanelSource).toContain("case 'cursor':");
    expect(agentPanelSource).toContain('<MousePointer2 className="h-3.5 w-3.5 shrink-0" />');
    expect(agentPanelSource).toContain("case 'opencode':");
    expect(agentPanelSource).toContain('<SquareTerminal className="h-3.5 w-3.5 shrink-0" />');
    expect(agentPanelSource).toContain("case 'auggie':");
    expect(agentPanelSource).toContain('<WandSparkles className="h-3.5 w-3.5 shrink-0" />');
    expect(agentPanelSource).toContain('{renderAgentLabelIcon(session.agentId)}');
    expect(agentPanelSource).toContain(
      'disabled={isCanvasLocked || canvasZoom <= AGENT_CANVAS_ZOOM_MIN}'
    );
    expect(agentPanelSource).toContain('disabled={isCanvasLocked}');
    expect(agentPanelSource).toContain(
      'disabled={isCanvasLocked || canvasZoom >= AGENT_CANVAS_ZOOM_MAX}'
    );
    expect(agentPanelSource).not.toContain(
      'if (!isCanvasDisplayMode || isCanvasLocked || event.button !== 0)'
    );
    expect(agentPanelSource).toContain('pointerButton: event.button');
    expect(agentPanelSource).toContain('spacePressed: spacePressedRef.current');
    expect(agentPanelSource).toContain('if (isCanvasLocked) {');
    expect(agentPanelSource).toContain('viewport.scrollTo({');
    expect(agentPanelSource).toContain('behavior: resolveAgentCanvasScrollBehavior');
    expect(agentPanelSource).toContain('buildSessionPanelDomId(id)');
    expect(agentPanelSource).toContain('canvasFloatingSessionId ? nextBounds : null');
    expect(agentPanelSource).toContain('mountedCurrentWorktreeSessionIds');
    expect(agentPanelSource).not.toContain(
      'return isActive ? canvasSessions.map((session) => session.id) : []'
    );
    expect(agentPanelSource).toContain('diffPersistentAgentSessionRecords');
    expect(agentPanelSource).toContain('currentWorktreeAgentStatuses');
    expect(agentPanelSource).toContain('useAgentStatusStore(');
    expect(agentPanelSource).toContain('useShallow((state) =>');
    expect(agentPanelSource).toContain(
      `gridTemplateColumns: \`repeat(\${AGENT_CANVAS_GRID_COLUMN_UNITS}, minmax(0, 1fr))\``
    );
    expect(agentPanelSource).not.toContain('onNotificationClick');
    expect(agentPanelSource).not.toContain('onAgentStopNotification');
    expect(agentPanelSource).not.toContain('onAskUserQuestionNotification');
    expect(agentPanelSource).not.toContain('onPreToolUseNotification');
    expect(agentPanelSource).not.toContain('showRendererNotification');
    expect(agentPanelSource).not.toContain('buildChatNotificationCopy');
    expect(agentPanelSource).not.toContain('initAgentStatusListener');
    expect(agentPanelSource).not.toContain("t('Start fresh session')");
    expect(agentPanelSource).not.toContain("t('Current')");
    expect(agentPanelSource.match(/<AgentTerminal/g)).toHaveLength(1);
  });
});
