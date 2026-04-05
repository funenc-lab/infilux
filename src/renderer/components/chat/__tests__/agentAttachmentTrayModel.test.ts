import { describe, expect, it } from 'vitest';
import {
  buildAgentAttachmentInsertText,
  buildAgentAttachmentMessage,
  mergeAgentAttachments,
  resolveAgentAttachmentSendDelay,
} from '../agentAttachmentTrayModel';

describe('agentAttachmentTrayModel', () => {
  it('classifies image paths, keeps first-seen order, and removes duplicates', () => {
    const attachments = mergeAgentAttachments(
      [],
      ['docs/spec.md', 'assets/diagram.PNG', 'docs/spec.md', '/tmp/final.webp']
    );

    expect(attachments).toEqual([
      {
        id: 'docs/spec.md',
        kind: 'file',
        name: 'spec.md',
        path: 'docs/spec.md',
      },
      {
        id: 'assets/diagram.PNG',
        kind: 'image',
        name: 'diagram.PNG',
        path: 'assets/diagram.PNG',
      },
      {
        id: '/tmp/final.webp',
        kind: 'image',
        name: 'final.webp',
        path: '/tmp/final.webp',
      },
    ]);
  });

  it('builds attachment-only payloads without leading blank lines', () => {
    const attachments = mergeAgentAttachments([], ['docs/spec.md', '/tmp/final.png']);

    expect(buildAgentAttachmentMessage('', attachments)).toBe('@docs/spec.md /tmp/final.png');
  });

  it('separates text and attachment tokens with one blank line', () => {
    const attachments = mergeAgentAttachments([], ['docs/spec.md', '/tmp/final.png']);

    expect(buildAgentAttachmentMessage('Review this change', attachments)).toBe(
      'Review this change\n\n@docs/spec.md /tmp/final.png'
    );
  });

  it('keeps quoted image paths with spaces and uses the image delay', () => {
    const attachments = mergeAgentAttachments([], ['/tmp/screen shot.png']);
    const message = buildAgentAttachmentMessage('Inspect', attachments);

    expect(message).toBe('Inspect\n\n"/tmp/screen shot.png"');
    expect(resolveAgentAttachmentSendDelay(message, attachments)).toBe(800);
  });

  it('quotes file mentions when the path contains spaces', () => {
    const attachments = mergeAgentAttachments([], ['/tmp/spec final.md']);

    expect(buildAgentAttachmentMessage('Review', attachments)).toBe(
      'Review\n\n@"/tmp/spec final.md"'
    );
  });

  it('formats attachment insert text for terminal-native providers without auto-send newlines', () => {
    const attachments = mergeAgentAttachments([], ['docs/spec.md', '/tmp/screen shot.png']);

    expect(buildAgentAttachmentInsertText(attachments)).toBe(
      ' @docs/spec.md "/tmp/screen shot.png"'
    );
  });

  it('uses the multiline delay when text already contains internal newlines', () => {
    expect(resolveAgentAttachmentSendDelay('Line one\nLine two', [])).toBe(300);
  });
});
