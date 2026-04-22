import { describe, expect, it } from 'vitest';
import { shouldHandleFileTreeShortcut } from '../fileTreeShortcutPolicy';

function asNode(value: unknown): Node {
  return value as Node;
}

describe('shouldHandleFileTreeShortcut', () => {
  it('handles shortcuts only when focus stays inside the file tree container', () => {
    const activeElement = { id: 'tree-button' };
    const container = {
      contains: (node: Node | null) => node === asNode(activeElement),
    };

    expect(
      shouldHandleFileTreeShortcut({
        container,
        activeElement: asNode(activeElement),
        target: { tagName: 'BUTTON' },
      })
    ).toBe(true);

    expect(
      shouldHandleFileTreeShortcut({
        container,
        activeElement: asNode({ id: 'editor-input' }),
        target: { tagName: 'BUTTON' },
      })
    ).toBe(false);
  });

  it('ignores shortcuts when the target is an editable control', () => {
    const activeElement = { id: 'tree-input' };
    const container = {
      contains: (node: Node | null) => node === asNode(activeElement),
    };

    expect(
      shouldHandleFileTreeShortcut({
        container,
        activeElement: asNode(activeElement),
        target: { tagName: 'INPUT' },
      })
    ).toBe(false);

    expect(
      shouldHandleFileTreeShortcut({
        container,
        activeElement: asNode(activeElement),
        target: { tagName: 'DIV', isContentEditable: true },
      })
    ).toBe(false);
  });

  it('ignores shortcuts when the target is nested inside a contenteditable region', () => {
    const activeElement = { id: 'tree-node' };
    const container = {
      contains: (node: Node | null) => node === asNode(activeElement),
    };

    expect(
      shouldHandleFileTreeShortcut({
        container,
        activeElement: asNode(activeElement),
        target: {
          tagName: 'SPAN',
          closest: (selector: string) => (selector === '[contenteditable="true"]' ? {} : null),
        },
      })
    ).toBe(false);
  });
});
