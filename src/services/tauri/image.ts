import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTaskStore } from '../../stores/taskStore';
import type { CachedImage, CacheKind, ImageMeta, TaskProgress } from '../../types/image';
import type { RenderSpec } from '../../types/renderSpec';
import type { BatchExportReport, ExportItem, ExportOptions } from '../../types/export';
import { errorMessage } from '../errorMessages';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
    return new AppError(String(error.code), String(error.message));
  }
  return new AppError('unknown', error instanceof Error ? error.message : String(error));
}
async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    throw new AppError('unsupported', 'This operation requires the Tauri application.');
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}
export const cacheAssetUrl = (path: string): string => convertFileSrc(path);
export const cancelTask = (taskId: string) => call<void>('task_cancel', { taskId });
export const listTasks = () => call<TaskProgress[]>('task_list');
export const listImageDirectory = (path: string) =>
  call<string[]>('image_list_directory', { path });
export const invalidateCache = (hashes: string[]) => call<number>('cache_invalidate', { hashes });

/** Listener lifetime belongs to this invocation; subscribe before work starts. */
async function run<T>(
  operation: string,
  args: Record<string, unknown>,
  taskId: string,
  wasCancelled?: (result: T) => boolean,
): Promise<T> {
  const receive = useTaskStore.getState().receive;
  const initial: TaskProgress = {
    taskId,
    operation,
    stage: 'queued',
    progress: 0,
    status: 'running',
    error: null,
  };
  if (useTaskStore.getState().tasks[taskId])
    throw new AppError('invalid_input', 'Use a fresh taskId for each request.');
  receive(initial);
  let unlisten: (() => void) | undefined;
  try {
    if (!isTauri())
      throw new AppError('unsupported', 'This operation requires the Tauri application.');
    unlisten = await listen<TaskProgress>('task://progress', ({ payload }) => {
      // Batch responses own their terminal status and partial results. A terminal
      // event arriving first must not prevent reconciliation with that response.
      if (
        payload.taskId === taskId &&
        (operation !== 'image_export_batch' || payload.status === 'running')
      )
        receive(payload);
    });
    const result = await call<T>(operation, { ...args, taskId });
    receive({
      ...initial,
      stage: 'finished',
      progress: 100,
      status: wasCancelled?.(result) ? 'cancelled' : 'completed',
    });
    return result;
  } catch (error) {
    const normalized = normalizeError(error);
    receive({
      ...initial,
      stage: 'finished',
      status: normalized.code === 'cancelled' ? 'cancelled' : 'failed',
      error: errorMessage(normalized),
    });
    throw normalized;
  } finally {
    unlisten?.();
  }
}
export const loadImage = (path: string, taskId = crypto.randomUUID()) =>
  run<ImageMeta>('image_load', { path }, taskId);
export const getCachedImage = (path: string, kind: CacheKind, taskId = crypto.randomUUID()) =>
  run<CachedImage>('thumb_get', { path, kind }, taskId);
export const exportImage = (spec: RenderSpec, outPath: string, taskId = crypto.randomUUID()) =>
  run<void>('image_export', { spec: structuredClone(spec), outPath }, taskId);
export const exportImageBatch = (
  items: ExportItem[],
  opts: ExportOptions,
  taskId = crypto.randomUUID(),
) =>
  run<BatchExportReport>(
    'image_export_batch',
    {
      items: items.map(({ itemId, sequenceIndex, spec }) => ({
        itemId,
        sequenceIndex,
        spec: structuredClone(spec),
      })),
      opts: structuredClone(opts),
    },
    taskId,
    (report) => report.cancellationRequested,
  );
export const applyBorderStub = (spec: RenderSpec) =>
  call<{ implemented: false; spec: RenderSpec }>('image_apply_border', { spec });
export const applyWatermarkStub = (spec: RenderSpec) =>
  call<{ implemented: false; spec: RenderSpec }>('image_apply_watermark', { spec });
