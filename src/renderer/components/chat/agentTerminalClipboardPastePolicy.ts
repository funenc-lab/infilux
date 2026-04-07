interface AgentClipboardFileDescriptor {
  type: string;
}

export function shouldCaptureAgentTerminalClipboardFiles(
  _agentId: string,
  files: AgentClipboardFileDescriptor[]
): boolean {
  // In the embedded xterm surface, clipboard file items do not become PTY input on their own.
  // Always bridge file/image paste through the app-managed attachment flow.
  return files.length > 0;
}
