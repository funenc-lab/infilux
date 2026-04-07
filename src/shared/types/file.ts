export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
  ignored?: boolean;
}

export interface FileChangeEvent {
  type: 'create' | 'update' | 'delete';
  path: string;
}

export interface FileReadResult {
  content: string;
  encoding: string;
  detectedEncoding: string;
  confidence: number;
  isBinary?: boolean;
}

export type ClipboardImageFormat = 'png' | 'jpeg';

export interface FileSaveClipboardImageToTempRequest {
  filename: string;
  format?: ClipboardImageFormat;
}

export interface FileTempSaveResult {
  success: boolean;
  path?: string;
  error?: string;
}
