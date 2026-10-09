import { isTauri } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';

export type WindowSizePreset = 'default' | 'compact' | 'spacious';
export type WindowSizeMode = WindowSizePreset | 'custom';

export const WINDOW_SIZE_KEY = 'still.window.size-preset';
export const CUSTOM_WINDOW_SIZE_KEY = 'still.window.custom-size';
type WindowSize = { width: number; height: number };
type WorkArea = WindowSize & { scaleFactor: number };

const SIZES: Record<WindowSizePreset, { width: number; height: number }> = {
  default: { width: 1100, height: 760 },
  compact: { width: 900, height: 620 },
  spacious: { width: 1360, height: 900 },
};

export function readWindowSizePreset(): WindowSizeMode {
  try {
    const stored = localStorage.getItem(WINDOW_SIZE_KEY);
    return stored === 'compact' || stored === 'spacious' || stored === 'custom'
      ? stored
      : 'default';
  } catch {
    return 'default';
  }
}

export function readCustomWindowSize(): WindowSize | null {
  try {
    const stored = localStorage.getItem(CUSTOM_WINDOW_SIZE_KEY);
    if (!stored) return null;
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const { width, height } = value as Record<string, unknown>;
    if (
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 640 ||
      height < 480 ||
      width > 10000 ||
      height > 10000
    )
      return null;
    return { width, height };
  } catch {
    return null;
  }
}

export function desktopWindowAvailable(): boolean {
  return isTauri() && platform() !== 'android' && platform() !== 'ios';
}

export function fitWindowSize(preset: WindowSizePreset, workArea?: WorkArea): WindowSize {
  return fitWindowSizeDimensions(SIZES[preset], workArea);
}

export function fitWindowSizeDimensions(requested: WindowSize, workArea?: WorkArea): WindowSize {
  if (!workArea || !Number.isFinite(workArea.scaleFactor) || workArea.scaleFactor <= 0) {
    return requested;
  }
  const availableWidth = Math.floor(workArea.width / workArea.scaleFactor) - 32;
  const availableHeight = Math.floor(workArea.height / workArea.scaleFactor) - 32;
  return {
    width: Math.max(640, Math.min(requested.width, availableWidth)),
    height: Math.max(480, Math.min(requested.height, availableHeight)),
  };
}

async function applyWindowSize(size: WindowSize, custom = false): Promise<void> {
  const window = getCurrentWindow();
  const monitor = await currentMonitor();
  const fitted = monitor
    ? fitWindowSizeDimensions(size, {
        width: monitor.workArea.size.width,
        height: monitor.workArea.size.height,
        scaleFactor: monitor.scaleFactor,
      })
    : custom
      ? SIZES.default
      : size;
  if (await window.isMaximized()) await window.unmaximize();
  await window.setSize(new LogicalSize(fitted.width, fitted.height));
  await window.center();
}

export async function applyWindowSizePreset(preset: WindowSizePreset): Promise<void> {
  if (!desktopWindowAvailable()) return;
  await applyWindowSize(SIZES[preset]);
}

async function captureWindowSize(
  unmaximize: boolean,
  stillCurrent: () => boolean = () => true,
): Promise<void> {
  const window = getCurrentWindow();
  if (await window.isMaximized()) {
    if (!unmaximize) return;
    await window.unmaximize();
  }
  const [physical, scaleFactor] = await Promise.all([window.innerSize(), window.scaleFactor()]);
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return;
  const width = Math.round(physical.width / scaleFactor);
  const height = Math.round(physical.height / scaleFactor);
  if (width < 640 || height < 480) return;
  if (!stillCurrent() || (readWindowSizePreset() !== 'custom' && !unmaximize)) return;
  localStorage.setItem(CUSTOM_WINDOW_SIZE_KEY, JSON.stringify({ width, height }));
}

export async function captureCustomWindowSize(): Promise<void> {
  if (!desktopWindowAvailable()) return;
  await captureWindowSize(true);
}

export async function installWindowSizeTracking(): Promise<() => Promise<void>> {
  if (!desktopWindowAvailable()) return async () => {};
  const window = getCurrentWindow();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave: Promise<void> | undefined;
  let revision = 0;
  let disposed = false;
  const save = (currentRevision: number): Promise<void> => {
    if (readWindowSizePreset() !== 'custom') return Promise.resolve();
    pendingSave = captureWindowSize(
      false,
      () => currentRevision === revision && readWindowSizePreset() === 'custom',
    ).catch((error) => console.warn('Unable to remember the window size', error));
    return pendingSave;
  };
  const unlisten = await window.onResized(() => {
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

export async function restoreWindowSizePreset(): Promise<void> {
  if (!desktopWindowAvailable()) return;
  // With no saved preference, let Tauri's original window configuration apply.
  if (localStorage.getItem(WINDOW_SIZE_KEY) === null) return;
  const mode = readWindowSizePreset();
  if (mode === 'custom') {
    await applyWindowSize(readCustomWindowSize() ?? SIZES.default, true);
  } else {
    await applyWindowSizePreset(mode);
  }
}
