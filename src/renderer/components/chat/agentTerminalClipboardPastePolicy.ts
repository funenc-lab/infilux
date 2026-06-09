interface AgentClipboardFileDescriptor {
  type: string;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

function isElementTarget(target: EventTarget | null): target is Element {
  return typeof Element !== 'undefined' && target instanceof Element;
}

export function shouldCaptureAgentTerminalClipboardFiles(
  _agentId: string,
  files: AgentClipboardFileDescriptor[]
): boolean {
  // In the embedded xterm surface, clipboard file items do not become PTY input on their own.
  // Always bridge file/image paste through the app-managed attachment flow.
  return files.length > 0;
}

export function collectAgentTerminalClipboardFiles(clipboardData: DataTransfer): File[] {
  const files: File[] = [];
  const items = clipboardData.items;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || item.kind !== 'file') {
      continue;
    }

    const file = item.getAsFile();
    if (file) {
      files.push(file);
    }
  }

  if (files.length > 0) {
    return files;
  }

  const clipboardFiles = clipboardData.files;
  if (!clipboardFiles) {
    return files;
  }

  for (let index = 0; index < clipboardFiles.length; index += 1) {
    const file = clipboardFiles[index];
    if (file) {
      files.push(file);
    }
  }

  return files;
}

export function hasAgentTerminalClipboardImageSignal(clipboardData: DataTransfer): boolean {
  const types = Array.from(clipboardData.types ?? []);
  if (types.some((type) => type.toLowerCase().startsWith('image/'))) {
    return true;
  }

  const items = clipboardData.items;
  for (let index = 0; index < items.length; index += 1) {
    const itemType = items[index]?.type?.toLowerCase() ?? '';
    if (itemType.startsWith('image/')) {
      return true;
    }
  }

  return false;
}

export function isEditableAgentTerminalClipboardPasteTarget(target: EventTarget | null): boolean {
  if (!isElementTarget(target)) {
    return false;
  }

  const editableTarget = target.closest(
    'textarea, input, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
  );
  if (!editableTarget) {
    return false;
  }

  if (editableTarget instanceof HTMLInputElement) {
    const type = editableTarget.type.toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }

  return true;
}
