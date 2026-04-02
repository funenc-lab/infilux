import { describe, expect, it } from 'vitest';
import { mapOutputStateToGlowState } from '../useOutputState';

describe('useOutputState', () => {
  it('maps outputting runtime state to the running glow state', () => {
    expect(mapOutputStateToGlowState('outputting')).toBe('running');
  });

  it('maps unread runtime state to the completed glow state', () => {
    expect(mapOutputStateToGlowState('unread')).toBe('completed');
  });

  it('keeps idle runtime state unchanged', () => {
    expect(mapOutputStateToGlowState('idle')).toBe('idle');
  });
});
