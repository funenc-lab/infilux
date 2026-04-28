import type { FileSearchResult } from '@shared/types';
import { createTodoContextDirectory, createTodoContextFile } from './todoTaskContext';
import type { TodoTaskContextDirectory, TodoTaskContextFile } from './types';

export interface TodoContextMentionMatch {
  start: number;
  query: string;
}

export interface TodoContextMentionReplacement {
  nextText: string;
  nextCursor: number;
}

export interface TodoContextMentionSelection {
  files: TodoTaskContextFile[];
  directories: TodoTaskContextDirectory[];
}

const MENTION_BOUNDARY_PATTERN = /[\s()[\]{}<>"'`.,;:!?，。！？；：、（）。【】《》]/u;

function isMentionBoundary(value: string | undefined): boolean {
  return value === undefined || MENTION_BOUNDARY_PATTERN.test(value);
}

function normalizeCursor(text: string, cursorPos: number): number {
  if (!Number.isFinite(cursorPos)) {
    return text.length;
  }
  return Math.max(0, Math.min(text.length, Math.floor(cursorPos)));
}

function normalizeSelectedPath(item: FileSearchResult): string | undefined {
  const relativePath = item.relativePath.trim();
  if (relativePath) {
    return relativePath;
  }

  const path = item.path.trim();
  return path || undefined;
}

function normalizeDirectoryMentionPath(path: string): string {
  return path.trim().replace(/[\\/]+$/g, '');
}

function mergePathRefs<T extends TodoTaskContextDirectory | TodoTaskContextFile>(
  refs: readonly T[],
  nextRef: T
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];

  for (const ref of [...refs, nextRef]) {
    const refPath = ref.path.trim();
    if (!refPath || seen.has(refPath)) {
      continue;
    }

    seen.add(refPath);
    const label = ref.label?.trim();
    merged.push((label ? { path: refPath, label } : { path: refPath }) as T);
  }

  return merged;
}

export function isTodoContextMentionDirectory(item: FileSearchResult): boolean {
  return item.kind === 'directory' || item.relativePath.trim().endsWith('/');
}

export function getTodoContextMentionReplacementPath(item: FileSearchResult): string {
  const path = normalizeSelectedPath(item) ?? '';
  if (!path || !isTodoContextMentionDirectory(item)) {
    return path;
  }
  return path.endsWith('/') || path.endsWith('\\') ? path : `${path}/`;
}

export function findTodoContextMention(
  text: string,
  cursorPos: number
): TodoContextMentionMatch | null {
  const cursor = normalizeCursor(text, cursorPos);

  for (let index = cursor - 1; index >= 0; index -= 1) {
    const ch = text[index];
    if (ch === '@') {
      const prev = index > 0 ? text[index - 1] : undefined;
      if (!isMentionBoundary(prev)) {
        return null;
      }

      return {
        start: index,
        query: text.slice(index + 1, cursor),
      };
    }

    if (isMentionBoundary(ch)) {
      return null;
    }
  }

  return null;
}

export function replaceTodoContextMention(
  text: string,
  cursorPos: number,
  relativePath: string
): TodoContextMentionReplacement | null {
  const cursor = normalizeCursor(text, cursorPos);
  const mention = findTodoContextMention(text, cursor);
  const path = relativePath.trim();
  if (!mention || !path) {
    return null;
  }

  const suffix = text.slice(cursor);
  const separator = suffix.length === 0 || isMentionBoundary(suffix[0]) ? '' : ' ';
  const replacement = `@${path}${separator}`;
  return {
    nextCursor: mention.start + replacement.length,
    nextText: text.slice(0, mention.start) + replacement + suffix,
  };
}

export function mergeTodoContextMentionFile(
  files: readonly TodoTaskContextFile[],
  item: FileSearchResult
): TodoTaskContextFile[] {
  const path = normalizeSelectedPath(item);
  if (!path) {
    return [...files];
  }

  return mergePathRefs(files, createTodoContextFile(path));
}

export function mergeTodoContextMentionSelection(
  selection: TodoContextMentionSelection,
  item: FileSearchResult
): TodoContextMentionSelection {
  const path = normalizeSelectedPath(item);
  if (!path) {
    return {
      directories: [...selection.directories],
      files: [...selection.files],
    };
  }

  if (isTodoContextMentionDirectory(item)) {
    return {
      directories: mergePathRefs(
        selection.directories,
        createTodoContextDirectory(normalizeDirectoryMentionPath(path))
      ),
      files: [...selection.files],
    };
  }

  return {
    directories: [...selection.directories],
    files: mergePathRefs(selection.files, createTodoContextFile(path)),
  };
}
