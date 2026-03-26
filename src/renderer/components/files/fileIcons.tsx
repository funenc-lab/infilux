import type { LucideIcon } from 'lucide-react';
import {
  Braces,
  Code,
  Database,
  File,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  FileType,
  Folder,
  FolderOpen,
  Settings,
  Terminal,
} from 'lucide-react';

// Image file extensions for preview
const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];

const fileIconMap: Record<string, LucideIcon> = {
  // JavaScript/TypeScript
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  mjs: FileCode,
  cjs: FileCode,
  // Data/Config
  json: FileJson,
  yaml: Settings,
  yml: Settings,
  toml: Settings,
  // Web
  html: Code,
  css: Braces,
  scss: Braces,
  less: Braces,
  // Images
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  bmp: FileImage,
  ico: FileImage,
  // Documents
  md: FileText,
  txt: FileText,
  pdf: FileText,
  // Shell/Scripts
  sh: Terminal,
  bash: Terminal,
  zsh: Terminal,
  // Database
  sql: Database,
  db: Database,
  sqlite: Database,
  // Fonts
  ttf: FileType,
  otf: FileType,
  woff: FileType,
  woff2: FileType,
  // Default
  default: File,
};

const specialFileIconMap: Record<string, LucideIcon> = {
  'package.json': FileJson,
  'tsconfig.json': Settings,
  '.gitignore': Settings,
  '.env': Settings,
  '.env.local': Settings,
  dockerfile: Terminal,
  'docker-compose.yml': Settings,
  'readme.md': FileText,
};

export function getFileIcon(name: string, isDirectory: boolean, isExpanded = false): LucideIcon {
  if (isDirectory) {
    return isExpanded ? FolderOpen : Folder;
  }

  const lowerName = name.toLowerCase();

  // Check special files first
  if (specialFileIconMap[lowerName]) {
    return specialFileIconMap[lowerName];
  }

  // Get extension
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return fileIconMap[ext] || fileIconMap.default;
}

export function getFileIconColor(name: string, isDirectory: boolean): string {
  if (isDirectory) {
    return 'text-warning';
  }

  const ext = name.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-info';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'text-warning';
    case 'json':
      return 'text-warning';
    case 'html':
      return 'text-support';
    case 'css':
    case 'scss':
    case 'less':
      return 'text-support';
    case 'md':
      return 'text-info';
    case 'pdf':
      return 'text-destructive';
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
      return 'text-success';
    default:
      return 'text-muted-foreground';
  }
}

export function isImageFile(path: string | null | undefined): boolean {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return imageExtensions.includes(ext);
}

export function isPdfFile(path: string | null | undefined): boolean {
  if (!path) return false;
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return ext === 'pdf';
}

/**
 * Check if a binary file is unsupported for preview.
 * Images and PDFs are binary but have dedicated preview components.
 */
export function isUnsupportedBinaryFile(
  path: string | null | undefined,
  isBinary: boolean | undefined
): boolean {
  if (!isBinary) return false;
  return !isImageFile(path) && !isPdfFile(path);
}
