import { isTauri } from '@tauri-apps/api/core';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import {
  availableMonitors,
  currentMonitor,
  getCurrentWindow,
  primaryMonitor,
} from '@tauri-apps/api/window';
import type { Monitor } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';

export const REMEMBER_WINDOW_POSITION_KEY = 'still.window.remember-position';
export const WINDOW_POSITION_KEY = 'still.window.position';

export type SavedWindowPosition = {
  monitorName: string | null;
  monitorX: number;
  monitorY: number;
  x: number;
  y: number;
};

const desktopWindowAvailable = () => isTauri() && platform() !== 'android' && platform() !== 'ios';

export function readRememberWindowPosition(): boolean {
  try {
    return localStorage.getItem(REMEMBER_WINDOW_POSITION_KEY) === 'true';
  } catch {
    return false;
  }
}

export function readWindowPosition(): SavedWindowPosition | null {
  try {
    const stored = localStorage.getItem(WINDOW_POSITION_KEY);
    if (!stored) return null;
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.monitorName !== null && typeof record.monitorName !== 'string') return null;
    for (const field of ['monitorX', 'monitorY', 'x', 'y'] as const) {
      const coordinate = record[field];
      if (
        typeof coordinate !== 'number' ||
        !Number.isFinite(coordinate) ||
        Math.abs(coordinate) > 100000
      ) {
        return null;
      }
    }
    return record as SavedWindowPosition;
  } catch {
    return null;
  }
}

export function fitWindowPosition(
  saved: SavedWindowPosition,
  workArea: { x: number; y: number; width: number; height: number; scaleFactor: number },
  outerSize: { width: number; height: number },
): { x: number; y: number } {
  const factor =
    Number.isFinite(workArea.scaleFactor) && workArea.scaleFactor > 0 ? workArea.scaleFactor : 1;
  const x = workArea.x + Math.round(saved.x * factor);
  const y = workArea.y + Math.round(saved.y * factor);
  return {
    x: Math.max(
      workArea.x,
      Math.min(x, workArea.x + Math.max(0, workArea.width - outerSize.width)),
    ),
    y: Math.max(
      workArea.y,
      Math.min(y, workArea.y + Math.max(0, workArea.height - outerSize.height)),
    ),
  };
}

export async function captureWindowPosition(
  stillCurrent: () => boolean = () => true,
): Promise<void> {
  if (!desktopWindowAvailable()) return;
  const window = getCurrentWindow();
  if ((await window.isMaximized()) || (await window.isMinimized())) return;
  const monitor = await currentMonitor();
  if (!monitor || !Number.isFinite(monitor.scaleFactor) || monitor.scaleFactor <= 0) return;
  const position = await window.outerPosition();
  const saved: SavedWindowPosition = {
    monitorName: monitor.name,
    monitorX: monitor.position.x,
    monitorY: monitor.position.y,
    x: Math.round((position.x - monitor.workArea.position.x) / monitor.scaleFactor),
    y: Math.round((position.y - monitor.workArea.position.y) / monitor.scaleFactor),
  };
  if (!stillCurrent() || !readRememberWindowPosition()) return;
  localStorage.setItem(WINDOW_POSITION_KEY, JSON.stringify(saved));
}

export async function restoreWindowPosition(): Promise<void> {
  if (!desktopWindowAvailable() || !readRememberWindowPosition()) return;
  const saved = readWindowPosition();
  if (!saved) return;
  const monitors = await availableMonitors();
  const monitor: Monitor | null | undefined =
    monitors.find(
      (candidate) =>
        candidate.name === saved.monitorName &&
        candidate.position.x === saved.monitorX &&
        candidate.position.y === saved.monitorY,
    ) ??
    (saved.monitorName !== null
      ? monitors.find((candidate) => candidate.name === saved.monitorName)
      : undefined) ??
    (await currentMonitor()) ??
    (await primaryMonitor()) ??
    monitors[0];
  if (!monitor) return;
  const window = getCurrentWindow();
  const outerSize = await window.outerSize();
  const position = fitWindowPosition(
    saved,
    {
      x: monitor.workArea.position.x,
      y: monitor.workArea.position.y,
      width: monitor.workArea.size.width,
      height: monitor.workArea.size.height,
      scaleFactor: monitor.scaleFactor,
    },
    outerSize,
  );
  await window.setPosition(new PhysicalPosition(position.x, position.y));
}

export async function installWindowPositionTracking(): Promise<() => Promise<void>> {
  if (!desktopWindowAvailable()) return async () => {};
  const window = getCurrentWindow();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave: Promise<void> | undefined;
  let revision = 0;
  let disposed = false;
  const save = (currentRevision: number): Promise<void> => {
    if (!readRememberWindowPosition()) return Promise.resolve();
    pendingSave = captureWindowPosition(() => currentRevision === revision).catch((error) => {
      if (currentRevision === revision)
        console.warn('Unable to remember the window position', error);
    });
    return pendingSave;
  };
  const unlisten = await window.onMoved(() => {
    if (disposed) return;
    const currentRevision = ++revision;
    globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => {
      timer = undefined;
      void save(currentRevision);
    }, 250);
  });
  return async () => {
    if (disposed) return;
    disposed = true;
    unlisten();
    if (timer !== undefined) {
      globalThis.clearTimeout(timer);
      timer = undefined;
      await save(revision);
    } else {
      await pendingSave;
    }
  };
}
