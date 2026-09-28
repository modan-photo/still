import { invoke, isTauri } from "@tauri-apps/api/core";
import { AppError, normalizeError } from "./image";
import type { ExifData, ExifEdits } from "../../types/exif";

const writeQueues = new Map<string, Promise<void>>();

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

export function writeExif(path: string, edits: ExifEdits): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    if (!isTauri()) {
      throw new AppError("unsupported", "EXIF editing is available in the desktop and mobile apps.");
    }

    try {
      await invoke<void>("exif_write", { path, edits });
    } catch (error) {
      throw normalizeError(error);
    }
  });
  writeQueues.set(path, operation);
  void operation.finally(() => {
    if (writeQueues.get(path) === operation) writeQueues.delete(path);
  }).catch(() => undefined);
  return operation;
}
