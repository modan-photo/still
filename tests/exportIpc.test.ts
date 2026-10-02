import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchExportReport, ExportOptions, PhotoExportItem } from '../src/types/export';
import type { TaskProgress } from '../src/types/image';

const mock = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), unlisten: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mock.invoke,
  isTauri: () => true,
  convertFileSrc: (path: string) => path,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: mock.listen }));
import { exportImageBatch } from '../src/services/tauri/image';
import { useTaskStore } from '../src/stores/taskStore';
import { errorMessage } from '../src/services/errorMessages';

let receive: (event: { payload: TaskProgress }) => void;
beforeEach(() => {
  vi.resetAllMocks();
  useTaskStore.setState({ tasks: {} });
  mock.listen.mockImplementation(async (_, callback) => {
    receive = callback;
    return mock.unlisten;
  });
});
const item: PhotoExportItem = {
  itemId: 'item-1',
  photoId: 'photo-1',
  sequenceIndex: 7,
  spec: { version: 1, source: { path: 'photo.png', width: 20, height: 20 } },
};
const options: ExportOptions = {
  format: 'png',
  quality: 100,
  outputDirectory: 'output',
  size: {
    mode: 'original',
    longEdge: null,
    percent: null,
    width: null,
    height: null,
    lockAspect: true,
  },
  naming: { mode: 'prefixSequence', suffix: '', prefix: 'still_', template: '', startNumber: 1 },
  conflict: 'rename',
  preserveExif: false,
  preserveIcc: false,
};
const report: BatchExportReport = {
  succeeded: 1,
  failed: 0,
  cancelled: 0,
  skipped: 0,
  cancellationRequested: true,
  outputDirectory: 'output',
  results: [
    {
      itemId: 'item-1',
      sourcePath: 'photo.png',
      outputPath: 'output/still_0008.png',
      status: 'success',
      code: null,
      message: null,
    },
  ],
};

describe('batch export IPC and terminal reconciliation', () => {
  it('sends item identities and sequence indices without workspace-only photo IDs', async () => {
    mock.invoke.mockResolvedValue(report);
    await expect(exportImageBatch([item], options, 'task-1')).resolves.toEqual(report);
    const [command, args] = mock.invoke.mock.calls[0];
    expect(command).toBe('image_export_batch');
    expect(args.items).toEqual([{ itemId: item.itemId, sequenceIndex: 7, spec: item.spec }]);
    expect(args.taskId).toBe('task-1');
    expect(useTaskStore.getState().tasks['task-1'].status).toBe('cancelled');
    expect(mock.unlisten).toHaveBeenCalledOnce();
  });
  it('reconciles a terminal event with the partial result and ignores unrelated tasks', async () => {
    mock.invoke.mockImplementation(async () => {
      const progress: TaskProgress = {
        taskId: 'task-2',
        operation: 'image_export_batch',
        stage: 'finished',
        progress: 100,
        status: 'completed',
        error: null,
      };
      receive({ payload: { ...progress, taskId: 'other' } });
      receive({ payload: progress });
      return report;
    });
    await exportImageBatch([item], options, 'task-2');
    expect(useTaskStore.getState().tasks['task-2'].status).toBe('cancelled');
    expect(useTaskStore.getState().tasks.other).toBeUndefined();
  });
  it('unsubscribes after a structured command failure and preserves its code', async () => {
    mock.invoke.mockRejectedValue({ code: 'file_read_only', message: 'backend detail' });
    await expect(exportImageBatch([item], options, 'task-3')).rejects.toMatchObject({
      code: 'file_read_only',
      message: 'backend detail',
    });
    expect(useTaskStore.getState().tasks['task-3'].status).toBe('failed');
    expect(useTaskStore.getState().tasks['task-3'].error).toContain('read-only');
    expect(mock.unlisten).toHaveBeenCalledOnce();
  });
  it('preserves unknown diagnostics rather than inventing a known error', () => {
    expect(errorMessage({ code: 'future_code', message: 'specific failure' })).toBe(
      'specific failure',
    );
  });
});
