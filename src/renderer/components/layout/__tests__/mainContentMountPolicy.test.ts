import { describe, expect, it } from 'vitest';
import { shouldKeepMountedTab, shouldRenderTabPanel } from '../mainContentMountPolicy';

describe('mainContentMountPolicy', () => {
  it('keeps chat, file, and terminal mounted across tab switches', () => {
    expect(shouldKeepMountedTab('chat')).toBe(true);
    expect(shouldKeepMountedTab('file')).toBe(true);
    expect(shouldKeepMountedTab('terminal')).toBe(true);
  });

  it('unmounts non-critical panels when they are inactive', () => {
    expect(shouldKeepMountedTab('source-control')).toBe(false);
    expect(shouldKeepMountedTab('todo')).toBe(false);
    expect(shouldKeepMountedTab('settings')).toBe(false);
    expect(shouldRenderTabPanel('source-control', 'chat')).toBe(false);
    expect(shouldRenderTabPanel('settings', 'terminal')).toBe(false);
  });

  it('always renders the active panel', () => {
    expect(shouldRenderTabPanel('source-control', 'source-control')).toBe(true);
    expect(shouldRenderTabPanel('todo', 'todo')).toBe(true);
    expect(shouldRenderTabPanel('settings', 'settings')).toBe(true);
  });
});
