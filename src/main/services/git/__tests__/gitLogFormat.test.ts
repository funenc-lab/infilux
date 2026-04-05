import { describe, expect, it } from 'vitest';
import {
  GIT_LOG_FIELD_SEPARATOR,
  GIT_LOG_RECORD_SEPARATOR,
  parseGitLogOutput,
} from '../gitLogFormat';

function createRecord(fields: string[]): string {
  return fields.join(GIT_LOG_FIELD_SEPARATOR) + GIT_LOG_RECORD_SEPARATOR;
}

describe('parseGitLogOutput', () => {
  it('parses subject and full message separately for multi-line commits', () => {
    const subject = 'feat(workflow): add configurable attachment prefetch rules';
    const output = createRecord([
      'abc123',
      '2026-03-24 10:38:45 +0800',
      'Test Author',
      'test@example.com',
      subject,
      [subject, '', '- add the prefetch toggle', '- restore complete history rendering'].join('\n'),
      'HEAD -> main, origin/main',
    ]);

    expect(parseGitLogOutput(output)).toEqual([
      {
        hash: 'abc123',
        date: '2026-03-24 10:38:45 +0800',
        author_name: 'Test Author',
        author_email: 'test@example.com',
        message: subject,
        fullMessage: [
          subject,
          '',
          '- add the prefetch toggle',
          '- restore complete history rendering',
        ].join('\n'),
        refs: 'main, origin/main',
      },
    ]);
  });

  it('falls back to subject when full message is empty', () => {
    const subject = 'fix(editor): resolve path parsing mismatch';
    const output = createRecord([
      'def456',
      '2026-03-24 11:00:00 +0800',
      'Infilux Team',
      'admin@j3n5en.com',
      subject,
      '',
      '',
    ]);

    expect(parseGitLogOutput(output)).toEqual([
      {
        hash: 'def456',
        date: '2026-03-24 11:00:00 +0800',
        author_name: 'Infilux Team',
        author_email: 'admin@j3n5en.com',
        message: subject,
        fullMessage: subject,
        refs: undefined,
      },
    ]);
  });

  it('drops empty HEAD refs after normalization', () => {
    const output =
      [
        'ghi789',
        '2026-03-24 12:00:00 +0800',
        'Tester',
        'tester@example.com',
        'chore: tidy',
        '',
        'HEAD ->',
      ].join(GIT_LOG_FIELD_SEPARATOR) + GIT_LOG_RECORD_SEPARATOR;

    expect(parseGitLogOutput(output)).toEqual([
      {
        hash: 'ghi789',
        date: '2026-03-24 12:00:00 +0800',
        author_name: 'Tester',
        author_email: 'tester@example.com',
        message: 'chore: tidy',
        fullMessage: 'chore: tidy',
        refs: undefined,
      },
    ]);
  });

  it('returns an empty array for empty output', () => {
    expect(parseGitLogOutput('')).toEqual([]);
  });

  it('defaults the hash to an empty string when the first field is missing', () => {
    const output = createRecord(['', '2026-03-24 14:00:00 +0800']);

    expect(parseGitLogOutput(output)).toEqual([
      {
        hash: '',
        date: '2026-03-24 14:00:00 +0800',
        author_name: '',
        author_email: '',
        message: '',
        fullMessage: '',
        refs: undefined,
      },
    ]);
  });

  it('ignores blank records, trims fields, and defaults missing fields', () => {
    const output = [
      createRecord(['short123']),
      `   ${GIT_LOG_RECORD_SEPARATOR}`,
      createRecord([
        'jkl012',
        '2026-03-24 13:00:00 +0800',
        'Example Dev',
        'dev@example.com',
        '  refactor: tighten parser  ',
        '  Expand parser coverage for edge cases  ',
        '  tag: v1.0.0, origin/release  ',
      ]),
    ].join('');

    expect(parseGitLogOutput(output)).toEqual([
      {
        hash: 'short123',
        date: '',
        author_name: '',
        author_email: '',
        message: '',
        fullMessage: '',
        refs: undefined,
      },
      {
        hash: 'jkl012',
        date: '2026-03-24 13:00:00 +0800',
        author_name: 'Example Dev',
        author_email: 'dev@example.com',
        message: 'refactor: tighten parser',
        fullMessage: 'Expand parser coverage for edge cases',
        refs: 'tag: v1.0.0, origin/release',
      },
    ]);
  });
});
