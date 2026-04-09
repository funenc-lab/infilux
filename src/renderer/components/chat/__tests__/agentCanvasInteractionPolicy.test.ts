import { describe, expect, it } from 'vitest';
import {
  AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE,
  AGENT_CANVAS_SESSION_PANEL_ATTRIBUTE,
  shouldStartAgentCanvasPan,
} from '../agentCanvasInteractionPolicy';

class MockElement {
  parentElement: MockElement | null = null;
  private readonly attributes = new Map<string, string>();

  append(child: MockElement): void {
    child.parentElement = this;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  closest(selector: string): MockElement | null {
    const match = selector.match(/^\[(.+)="(.+)"\]$/);
    if (!match) {
      return null;
    }

    const [, attributeName, attributeValue] = match;
    let current: MockElement | null = this;
    while (current) {
      if (current.attributes.get(attributeName) === attributeValue) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }
}

function createElement(): Element {
  return new MockElement() as unknown as Element;
}

function withMockElementGlobal<T>(run: () => T): T {
  const previousElement = globalThis.Element;
  globalThis.Element = MockElement as unknown as typeof Element;

  try {
    return run();
  } finally {
    if (previousElement) {
      globalThis.Element = previousElement;
    } else {
      Reflect.deleteProperty(globalThis, 'Element');
    }
  }
}

describe('agent canvas interaction policy', () => {
  it('starts panning from blank canvas space', () => {
    withMockElementGlobal(() => {
      const target = createElement();

      expect(
        shouldStartAgentCanvasPan({
          isCanvasDisplayMode: true,
          isCanvasLocked: false,
          pointerButton: 0,
          spacePressed: false,
          target,
        })
      ).toBe(true);
    });
  });

  it('blocks panning from session tiles unless the space modifier is held', () => {
    withMockElementGlobal(() => {
      const sessionPanel = createElement();
      sessionPanel.setAttribute(AGENT_CANVAS_SESSION_PANEL_ATTRIBUTE, 'true');
      const headerButton = createElement();
      sessionPanel.append(headerButton);

      expect(
        shouldStartAgentCanvasPan({
          isCanvasDisplayMode: true,
          isCanvasLocked: false,
          pointerButton: 0,
          spacePressed: false,
          target: headerButton,
        })
      ).toBe(false);

      expect(
        shouldStartAgentCanvasPan({
          isCanvasDisplayMode: true,
          isCanvasLocked: false,
          pointerButton: 0,
          spacePressed: true,
          target: headerButton,
        })
      ).toBe(true);
    });
  });

  it('blocks panning from floating portal controls and backdrops', () => {
    withMockElementGlobal(() => {
      const interactiveSurface = createElement();
      interactiveSurface.setAttribute(AGENT_CANVAS_INTERACTIVE_SURFACE_ATTRIBUTE, 'true');
      const icon = createElement();
      interactiveSurface.append(icon);

      expect(
        shouldStartAgentCanvasPan({
          isCanvasDisplayMode: true,
          isCanvasLocked: false,
          pointerButton: 0,
          spacePressed: true,
          target: icon,
        })
      ).toBe(false);
    });
  });

  it('blocks panning when canvas mode is unavailable, locked, or using a non-primary button', () => {
    withMockElementGlobal(() => {
      const target = createElement();

      expect(
        shouldStartAgentCanvasPan({
          isCanvasDisplayMode: false,
          isCanvasLocked: false,
          pointerButton: 0,
          spacePressed: false,
          target,
        })
      ).toBe(false);
      expect(
        shouldStartAgentCanvasPan({
          isCanvasDisplayMode: true,
          isCanvasLocked: true,
          pointerButton: 0,
          spacePressed: false,
          target,
        })
      ).toBe(false);
      expect(
        shouldStartAgentCanvasPan({
          isCanvasDisplayMode: true,
          isCanvasLocked: false,
          pointerButton: 1,
          spacePressed: false,
          target,
        })
      ).toBe(false);
    });
  });
});
