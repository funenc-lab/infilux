export interface FileSearchParams {
  rootPath: string;
  query: string;
  maxResults?: number;
  useGitignore?: boolean;
  includeDirectories?: boolean;
}

export interface ContentSearchParams {
  rootPath: string;
  query: string;
  maxResults?: number;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  filePattern?: string;
  useGitignore?: boolean;
}

export type FileSearchResultKind = 'file' | 'directory';

export interface FileSearchResult {
  path: string;
  name: string;
  relativePath: string;
  score: number;
  kind?: FileSearchResultKind;
}

export interface ContentSearchMatch {
  path: string;
  relativePath: string;
  line: number;
  column: number;
  matchLength: number;
  content: string;
  beforeContext?: string[];
  afterContext?: string[];
}

export interface ContentSearchResult {
  matches: ContentSearchMatch[];
  totalMatches: number;
  totalFiles: number;
  truncated: boolean;
}
