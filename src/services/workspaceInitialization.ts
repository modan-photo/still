import { invoke, isTauri } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';

const SESSION_FIELDS = [
  'lastFramePresetId', 'lastWatermarkPresetId', 'lastUsedSpec', 'lastAppliedSpec',
  'photoList', 'lastImportPath', 'activeRightTab', 'rightPanelCollapsed',
  'inspectorOpen', 'gridPanelOpen', 'isCollageMode', 'photos', 'renderSpecs',
  'collageDraft', 'undoStack', 'currentPhotoId', 'selectedId', 'selectedIds',
] as const;

function migrateLegacyBrowserState() {
  try {
    if (typeof localStorage === 'undefined') return;
    const storageKey = 'still.ui-state';
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) {
      let fields: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(stored);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          fields = parsed as Record<string, unknown>;
        }
      } catch {
        // Legacy UI state has no user presets; discard malformed session data.
      }
      let changed = fields.version !== 2;
      for (const field of SESSION_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(fields, field)) {
          delete fields[field];
          changed = true;
        }
      }
      if (changed) localStorage.setItem(storageKey, JSON.stringify({ ...fields, version: 2 }));
    }
  } catch (error) {
    console.warn('Unable to migrate legacy browser UI state', error);
  }

  try {
    if (typeof localStorage === 'undefined') return;
    const legacyKeys: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith('still.crop.v1:')) legacyKeys.push(key);
    }
    // Collect first so removals do not shift indices and skip old records.
    for (const key of legacyKeys) localStorage.removeItem(key);
  } catch (error) {
    console.warn('Unable to remove legacy photo transforms', error);
  }
}

export async function migratePreferencesIfNeeded(): Promise<void> {
  if (isTauri()) {
    try {
      await invoke('migrate_preferences_if_needed');
    } catch (error) {
      console.warn('Unable to migrate legacy preference files', error);
    }
  }
  migrateLegacyBrowserState();
}

async function initialize(): Promise<void> {
  if (isTauri()) {
    try {
      if (platform() === 'android') {
        // A recreated WebView has no listeners for tasks started by its predecessor.
        // Leave ordinary backgrounding alone; cancel only on a fresh JS startup.
        await invoke('task_cancel_all');
      }
    } catch (error) {
      console.warn('Unable to cancel orphaned Android tasks', error);
    }
    try {
      await invoke('cleanup_legacy_session_files');
    } catch (error) {
      console.warn('Unable to clean legacy session files', error);
    }
  }
  await migratePreferencesIfNeeded();
}

let initialization: Promise<void> | undefined = import.meta.hot?.data.workspaceInitialization;

/** Run before mounting the editor, once per window lifetime. */
export function initializeWorkspace(): Promise<void> {
  initialization ??= initialize();
  return initialization;
}

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => { data.workspaceInitialization = initialization; });
}
