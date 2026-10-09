export type SingleKeyAction = 'grid' | 'remove' | 'inspector' | 'photoNavigation';
export type SingleKeyActions = Record<SingleKeyAction, boolean>;

export const SINGLE_KEY_ACTIONS_KEY = 'still.shortcuts.single-key-actions';

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
