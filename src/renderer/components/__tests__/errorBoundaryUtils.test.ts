import { describe, expect, it } from 'vitest';
import { formatErrorBoundaryMessage } from '../errorBoundaryUtils';

describe('formatErrorBoundaryMessage', () => {
  it('formats standard Error instances', () => {
    const message = formatErrorBoundaryMessage(new Error('Renderer exploded'));

    expect(message).toBe('Error: Renderer exploded');
  });

  it('falls back for unknown thrown values', () => {
    const message = formatErrorBoundaryMessage({
      reason: 'bad-state',
    });

    expect(message).toBe('Unknown renderer error');
  });
});
