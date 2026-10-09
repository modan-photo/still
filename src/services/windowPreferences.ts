import { isTauri } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';

export type WindowSizePreset = 'default' | 'compact' | 'spacious';

export const WINDOW_SIZE_KEY = 'still.window.size-preset';

const SIZES: Record<WindowSizePreset, { width: number; height: number }> = {
  default: { width: 1100, height: 760 },
  compact: { width: 900, height: 620 },
  spacious: { width: 1360, height: 900 },
};

export function readWindowSizePreset(): WindowSizePreset {
  try {
    const stored = localStorage.getItem(WINDOW_SIZE_KEY);
    return stored === 'compact' || stored === 'spacious' ? stored : 'default';
  } catch {
    return 'default';
  }
}

export function desktopWindowAvailable(): boolean {
  return isTauri() && platform() !== 'android' && platform() !== 'ios';
}

export function fitWindowSize(
  preset: WindowSizePreset,
  workArea?: { width: number; height: number; scaleFactor: number },
): { width: number; height: number } {
  const requested = SIZES[preset];
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

export async function applyWindowSizePreset(preset: WindowSizePreset): Promise<void> {
  if (!desktopWindowAvailable()) return;
  const window = getCurrentWindow();
  const monitor = await currentMonitor();
  const size = fitWindowSize(
    preset,
    monitor
      ? {
          width: monitor.workArea.size.width,
          height: monitor.workArea.size.height,
          scaleFactor: monitor.scaleFactor,
        }
      : undefined,
  );
  if (await window.isMaximized()) await window.unmaximize();
  await window.setSize(new LogicalSize(size.width, size.height));
  await window.center();
}

export async function restoreWindowSizePreset(): Promise<void> {
  if (!desktopWindowAvailable()) return;
  // With no saved preference, let Tauri's original window configuration apply.
  if (localStorage.getItem(WINDOW_SIZE_KEY) === null) return;
  await applyWindowSizePreset(readWindowSizePreset());
}
