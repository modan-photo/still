import { invoke, isTauri } from "@tauri-apps/api/core";
import { AppError, normalizeError } from "./image";
import type { ExifData, ExifEdits } from "../../types/exif";

const writeQueues = new Map<string, Promise<void>>();

export type ExifWriteResult = { backupCleanupPath: string | null };
export type ExifBatchItem = { id: string; path: string };
export type ExifBatchResult = { sourceCount: number; photoIds: string[]; backupCleanupPaths: string[] };

export async function readExif(path: string): Promise<ExifData> {
  if (!isTauri()) {
    throw new AppError("unsupported", "EXIF is available in the desktop and mobile apps.");
  }

  try {
    return await invoke<ExifData>("exif_read", { path });
  } catch (error) {
    throw normalizeError(error);
  }
}

export function writeExif(path: string, edits: ExifEdits): Promise<ExifWriteResult> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    if (!isTauri()) {
      throw new AppError("unsupported", "EXIF editing is available in the desktop and mobile apps.");
    }

    try {
      return await invoke<ExifWriteResult>("exif_write", { path, edits });
    } catch (error) {
      throw normalizeError(error);
    }
  });
  const queued = operation.then(() => undefined);
  writeQueues.set(path, queued);
  void queued.finally(() => {
    if (writeQueues.get(path) === queued) writeQueues.delete(path);
  }).catch(() => undefined);
  return operation;
}

export function writeExifBatch(items: ExifBatchItem[], edits: ExifEdits): Promise<ExifBatchResult> {
  const paths = [...new Set(items.map((item) => item.path))];
  const prior = Promise.all(paths.map((path) => writeQueues.get(path)?.catch(() => undefined)));
  const operation = prior.then(async () => {
    if (!isTauri()) throw new AppError('unsupported', 'EXIF batch editing requires the desktop app.');
    try {
      return await invoke<ExifBatchResult>('exif_write_batch', { items, edits });
    } catch (error) {
      throw normalizeError(error);
    }
  });
  const queued = operation.then(() => undefined);
  paths.forEach((path) => writeQueues.set(path, queued));
  void queued.finally(() => {
    paths.forEach((path) => {
      if (writeQueues.get(path) === queued) writeQueues.delete(path);
    });
  }).catch(() => undefined);
  return operation;
}
