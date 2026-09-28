import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useTaskStore } from '../../stores/taskStore';
import type { TaskProgress } from '../../types/image';
import type { CollageConfig, CollageItem } from '../../types/collage';
import { AppError, normalizeError } from './image';

export async function composeCollage(items: CollageItem[], config: CollageConfig, taskId = crypto.randomUUID()) {
  if (!isTauri()) throw new AppError('unsupported', 'Collage export requires the desktop application.');
  const receive = useTaskStore.getState().receive;
  const initial: TaskProgress = { taskId, operation: 'collage_compose', stage: 'queued', progress: 0, status: 'running', error: null };
  receive(initial);
  const unlisten = await listen<TaskProgress>('task://progress', ({ payload }) => { if (payload.taskId === taskId) receive(payload); });
  try {
    const wireItems = items.map(({ id: _id, ...item }) => item);
    return await invoke<string>('collage_compose', { taskId, items: structuredClone(wireItems), config: structuredClone(config) });
  } catch (error) {
    const normalized = normalizeError(error);
    receive({ ...initial, stage: 'finished', status: normalized.code === 'cancelled' ? 'cancelled' : 'failed', error: normalized.message });
    throw normalized;
  } finally { unlisten(); }
}
