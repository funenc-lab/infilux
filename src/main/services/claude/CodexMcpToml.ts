import type { McpServerConfig } from '@shared/types';

type CodexTomlValue = string | boolean | CodexTomlValue[] | { [key: string]: CodexTomlValue };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function splitTomlTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inDoubleQuotedString = false;
  let inSingleQuotedString = false;
  let bracketDepth = 0;
  let braceDepth = 0;
  let escaped = false;

  for (const character of input) {
    if (inDoubleQuotedString) {
      current += character;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inDoubleQuotedString = false;
      }
      continue;
    }

    if (inSingleQuotedString) {
      current += character;
      if (character === "'") {
        inSingleQuotedString = false;
      }
      continue;
    }

    if (character === '"') {
      inDoubleQuotedString = true;
      current += character;
      continue;
    }

    if (character === "'") {
      inSingleQuotedString = true;
      current += character;
      continue;
    }

    if (character === '[') {
      bracketDepth += 1;
      current += character;
      continue;
    }

    if (character === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += character;
      continue;
    }

    if (character === '{') {
      braceDepth += 1;
      current += character;
      continue;
    }

    if (character === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      current += character;
      continue;
    }

    if (
      character === separator &&
      bracketDepth === 0 &&
      braceDepth === 0 &&
      !inDoubleQuotedString &&
      !inSingleQuotedString
    ) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function stripTomlComment(line: string): string {
  let result = '';
  let inDoubleQuotedString = false;
  let inSingleQuotedString = false;
  let escaped = false;

  for (const character of line) {
    if (inDoubleQuotedString) {
      result += character;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '"') {
        inDoubleQuotedString = false;
      }
      continue;
    }

    if (inSingleQuotedString) {
      result += character;
      if (character === "'") {
        inSingleQuotedString = false;
      }
      continue;
    }

    if (character === '"') {
      inDoubleQuotedString = true;
      result += character;
      continue;
    }

    if (character === "'") {
      inSingleQuotedString = true;
      result += character;
      continue;
    }

    if (character === '#') {
      break;
    }

    result += character;
  }

  return result.trim();
}

function parseTomlKeyPath(input: string): string[] {
  return splitTomlTopLevel(input.trim(), '.')
    .map((segment) => {
      const trimmed = segment.trim();
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ) {
        return trimmed.slice(1, -1);
      }
      return trimmed;
    })
    .filter(Boolean);
}

function parseTomlString(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }

  return null;
}

function parseTomlInlineTable(value: string): Record<string, CodexTomlValue> | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }

  const entries = splitTomlTopLevel(trimmed.slice(1, -1), ',');
  const table: Record<string, CodexTomlValue> = {};

  for (const entry of entries) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const keyPath = parseTomlKeyPath(entry.slice(0, separatorIndex));
    if (keyPath.length !== 1) {
      continue;
    }

    const parsedValue = parseTomlValue(entry.slice(separatorIndex + 1));
    if (parsedValue === null) {
      continue;
    }

    table[keyPath[0]] = parsedValue;
  }

  return table;
}

function parseTomlArray(value: string): CodexTomlValue[] | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  const entries = splitTomlTopLevel(trimmed.slice(1, -1), ',');
  const parsedEntries: CodexTomlValue[] = [];

  for (const entry of entries) {
    const parsedValue = parseTomlValue(entry);
    if (parsedValue === null) {
      return null;
    }
    parsedEntries.push(parsedValue);
  }

  return parsedEntries;
}

function parseTomlValue(value: string): CodexTomlValue | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsedString = parseTomlString(trimmed);
  if (parsedString !== null) {
    return parsedString;
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  const parsedArray = parseTomlArray(trimmed);
  if (parsedArray !== null) {
    return parsedArray;
  }

  const parsedInlineTable = parseTomlInlineTable(trimmed);
  if (parsedInlineTable !== null) {
    return parsedInlineTable;
  }

  return null;
}

function assignTomlPath(
  target: Record<string, CodexTomlValue>,
  keyPath: string[],
  value: CodexTomlValue
): void {
  if (keyPath.length === 0) {
    return;
  }

  let current: Record<string, CodexTomlValue> = target;
  for (const segment of keyPath.slice(0, -1)) {
    const existing = current[segment];
    if (!existing || Array.isArray(existing) || typeof existing !== 'object') {
      current[segment] = {};
    }
    current = current[segment] as Record<string, CodexTomlValue>;
  }

  current[keyPath[keyPath.length - 1]] = value;
}

function parseCodexToml(content: string | null): Record<string, CodexTomlValue> {
  const root: Record<string, CodexTomlValue> = {};
  let currentTablePath: string[] = [];

  for (const rawLine of content?.split(/\r?\n/) ?? []) {
    const line = stripTomlComment(rawLine);
    if (!line) {
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      currentTablePath = parseTomlKeyPath(line.slice(1, -1));
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const keyPath = parseTomlKeyPath(line.slice(0, separatorIndex));
    if (keyPath.length === 0) {
      continue;
    }

    const parsedValue = parseTomlValue(line.slice(separatorIndex + 1));
    if (parsedValue === null) {
      continue;
    }

    assignTomlPath(root, [...currentTablePath, ...keyPath], parsedValue);
  }

  return root;
}

function toStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...value]
    : undefined;
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(([, entry]) => typeof entry === 'string');
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string>;
}

export function parseCodexMcpRecord(content: string | null): Record<string, McpServerConfig> {
  const parsedToml = parseCodexToml(content);
  const rawMcpServers = parsedToml.mcp_servers;
  if (!isRecord(rawMcpServers)) {
    return {};
  }

  const servers: Record<string, McpServerConfig> = {};
  for (const [id, value] of Object.entries(rawMcpServers)) {
    if (!isRecord(value)) {
      continue;
    }

    const args = toStringArray(value.args);
    const env = toStringRecord(value.env);
    if (typeof value.command === 'string') {
      servers[id] = {
        command: value.command,
        ...(args ? { args } : {}),
        ...(env ? { env } : {}),
      };
      continue;
    }

    if (typeof value.url === 'string') {
      const headers = toStringRecord(value.headers) ?? toStringRecord(value.http_headers);
      const transport =
        value.transport === 'sse' || value.type === 'sse'
          ? 'sse'
          : value.transport === 'http' || value.type === 'http'
            ? 'http'
            : 'http';
      servers[id] = {
        type: transport,
        url: value.url,
        ...(headers ? { headers } : {}),
      };
    }
  }

  return servers;
}
