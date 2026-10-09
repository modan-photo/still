import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { platform } from '@tauri-apps/plugin-os';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useUndoStore } from '../stores/undoStore';
import { useEditHistoryStore } from '../stores/editHistoryStore';

const CLOSE_TIMEOUT_MS = 500;

/** Discard session memory without invoking cache removal or preference setters. */
export function discardWorkspaceSession() {
  const resets = [
    () => useUndoStore.getState().clear(),
    () => useEditHistoryStore.getState().clear(),
    () => useProjectStore.getState().resetSession(),
    () => useUIStore.getState().resetSession(),
  ];
  for (const reset of resets) {
    try {
      reset();
    } catch (error) {
      console.warn('Unable to reset workspace memory during shutdown', error);
    }
  }
}

export async function installWorkspaceCloseHandler(
  stopEditor: () => void | Promise<void>,
): Promise<() => void> {
  if (!isTauri() || platform() === 'android' || platform() === 'ios') return () => {};
  const appWindow = getCurrentWindow();
  let closing = false;
  let destroyed = false;
  let disposed = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const destroyWindow = async () => {
    try {
      await appWindow.destroy();
      destroyed = true;
      globalThis.clearTimeout(timeout);
    } catch (error) {
      console.error('Unable to destroy the window', error);
    }
  };

  const unlisten = await appWindow.onCloseRequested(async (event) => {
    if (disposed) return;
    event.preventDefault();
    if (closing) return;
    closing = true;
    timeout = globalThis.setTimeout(() => {
      if (destroyed) return;
      discardWorkspaceSession();
      void destroyWindow();
    }, CLOSE_TIMEOUT_MS);

    try {
      // Unmounting stops outstanding imports from committing into the stores.
      await stopEditor();
    } catch (error) {
      console.warn('Unable to stop the editor during shutdown', error);
    }
    if (destroyed) return;
    discardWorkspaceSession();
    await destroyWindow();
  });

  // Listener disposal is also used by HMR and never resets session state.
  return () => {
    disposed = true;
    unlisten();
    globalThis.clearTimeout(timeout);
  };
}
