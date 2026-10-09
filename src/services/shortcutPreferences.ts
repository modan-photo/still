export type SingleKeyAction = 'grid' | 'remove' | 'inspector' | 'photoNavigation';
export type SingleKeyActions = Record<SingleKeyAction, boolean>;

export const SINGLE_KEY_ACTIONS_KEY = 'still.shortcuts.single-key-actions';
export const GRID_SHORTCUT_KEY = 'still.shortcuts.grid-key';
export const PHOTO_NAVIGATION_KEYS_KEY = 'still.shortcuts.photo-navigation-keys';

export type GridShortcutKey = 'g' | 'v';
export type PhotoNavigationKeys = 'arrows' | 'jl';

const DEFAULT_ACTIONS: SingleKeyActions = {
  grid: true,
  remove: true,
  inspector: true,
  photoNavigation: true,
};

export function readSingleKeyActions(): SingleKeyActions {
  try {
    const stored = localStorage.getItem(SINGLE_KEY_ACTIONS_KEY);
    if (!stored) return { ...DEFAULT_ACTIONS };
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_ACTIONS };
    }
    const record = parsed as Record<string, unknown>;
    return {
      grid: typeof record.grid === 'boolean' ? record.grid : true,
      remove: typeof record.remove === 'boolean' ? record.remove : true,
      inspector: typeof record.inspector === 'boolean' ? record.inspector : true,
      photoNavigation: typeof record.photoNavigation === 'boolean' ? record.photoNavigation : true,
    };
  } catch {
    return { ...DEFAULT_ACTIONS };
  }
}

export function singleKeyActionEnabled(
  globallyEnabled: boolean,
  actions: SingleKeyActions,
  action: SingleKeyAction,
): boolean {
  return globallyEnabled && actions[action];
}

export function readGridShortcutKey(): GridShortcutKey {
  try {
    return localStorage.getItem(GRID_SHORTCUT_KEY) === 'v' ? 'v' : 'g';
  } catch {
    return 'g';
  }
}

export function readPhotoNavigationKeys(): PhotoNavigationKeys {
  try {
    return localStorage.getItem(PHOTO_NAVIGATION_KEYS_KEY) === 'jl' ? 'jl' : 'arrows';
  } catch {
    return 'arrows';
  }
}

export function gridShortcutMatches(key: string, binding: GridShortcutKey): boolean {
  return key.toLowerCase() === binding;
}

export function photoNavigationDirection(key: string, binding: PhotoNavigationKeys): -1 | 1 | null {
  if (binding === 'jl') {
    if (key.toLowerCase() === 'j') return -1;
    if (key.toLowerCase() === 'l') return 1;
    return null;
  }
  if (key === 'ArrowLeft') return -1;
  if (key === 'ArrowRight') return 1;
  return null;
}
