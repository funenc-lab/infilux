interface ClosestCapableTarget {
  closest: (selector: string) => unknown;
}

interface EditableKeyboardTarget {
  tagName?: string;
  isContentEditable?: boolean;
}

interface FocusContainer {
  contains: (node: Node | null) => boolean;
}

interface FileTreeShortcutHandlingOptions {
  container: FocusContainer | null;
  activeElement: Node | null;
  target: unknown;
}

function hasClosest(target: unknown): target is ClosestCapableTarget {
  return target !== null && typeof target === 'object' && 'closest' in target;
}

function isEditableKeyboardTarget(target: unknown): target is EditableKeyboardTarget {
  return target !== null && typeof target === 'object';
}

export function shouldHandleFileTreeShortcut(options: FileTreeShortcutHandlingOptions): boolean {
  const { container, activeElement, target } = options;
  if (!container || !activeElement || !container.contains(activeElement)) {
    return false;
  }

  if (!isEditableKeyboardTarget(target)) {
    return true;
  }

  const tagName = target.tagName?.toUpperCase();
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return false;
  }

  if (target.isContentEditable) {
    return false;
  }

  if (hasClosest(target) && target.closest('[contenteditable="true"]')) {
    return false;
  }

  return true;
}
