import { invoke, isTauri } from "@tauri-apps/api/core";
import { AppError, normalizeError } from "./image";
import type { ExifData, ExifEdits } from "../../types/exif";

const writeQueues = new Map<string, Promise<void>>();

export type ExifWriteResult = { backupCleanupPath: string | null };

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
