export const AGENT_ATTACHMENT_PASTE_EVENT_NAME = 'infilux:paste-agent-attachment';

export function dispatchAgentAttachmentPasteEvent(target: Window = window): void {
  target.dispatchEvent(new CustomEvent(AGENT_ATTACHMENT_PASTE_EVENT_NAME));
}
