import { getCurrentWindow } from '@tauri-apps/api/window';
import { desktopWindowAvailable } from './windowPreferences';

export const REMEMBER_WINDOW_MAXIMIZED_KEY = 'still.window.remember-maximized';
export const WINDOW_MAXIMIZED_KEY = 'still.window.maximized';

export function readRememberWindowMaximized(): boolean {
  try {
    return localStorage.getItem(REMEMBER_WINDOW_MAXIMIZED_KEY) === 'true';
  } catch {
    return false;
  }
}

function readWindowMaximized(): boolean {
  try {
    return localStorage.getItem(WINDOW_MAXIMIZED_KEY) === 'true';
  } catch {
    return false;
  }
}

export async function captureWindowMaximized(
  stillCurrent: () => boolean = () => true,
): Promise<void> {
  if (!desktopWindowAvailable()) return;
  const window = getCurrentWindow();
  if (await window.isMinimized()) return;
  const maximized = await window.isMaximized();
  if (!stillCurrent() || !readRememberWindowMaximized()) return;
  localStorage.setItem(WINDOW_MAXIMIZED_KEY, String(maximized));
}

export async function restoreWindowMaximized(): Promise<void> {
  if (!desktopWindowAvailable() || !readRememberWindowMaximized() || !readWindowMaximized()) return;
  await getCurrentWindow().maximize();
}

export async function installWindowMaximizationTracking(): Promise<() => Promise<void>> {
  if (!desktopWindowAvailable()) return async () => {};
  const window = getCurrentWindow();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave: Promise<void> | undefined;
  let revision = 0;
  let disposed = false;
  const save = (currentRevision: number): Promise<void> => {
    if (!readRememberWindowMaximized()) return Promise.resolve();
    pendingSave = captureWindowMaximized(() => currentRevision === revision).catch((error) => {
      if (currentRevision === revision)
        console.warn('Unable to remember the window maximization state', error);
    });
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
    }
    await save(++revision);
  };
}
