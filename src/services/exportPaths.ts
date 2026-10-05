import type { OutputFormat } from '../types/renderSpec';

export const isDocumentUri = (path: string) => path.startsWith('content://');

export function parentDirectory(path: string) {
  // Provider IDs are opaque: their slash characters do not describe local folders.
  if (isDocumentUri(path)) return '';
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index > 0 ? path.slice(0, index) : '';
}

export function withOutputExtension(path: string, format: OutputFormat) {
  if (!path || isDocumentUri(path)) return path;
  const extension = format === 'jpeg' ? 'jpg' : format;
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const dot = path.lastIndexOf('.');
  return `${dot > separator ? path.slice(0, dot) : path}.${extension}`;
}

export function recentFilesystemDirectories(entries: unknown): string[] {
  return Array.isArray(entries)
    ? entries
        .filter((entry): entry is string => typeof entry === 'string' && !isDocumentUri(entry))
        .slice(0, 5)
    : [];
}
