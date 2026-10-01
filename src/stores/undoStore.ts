import { createSessionStore } from "./createSessionStore";
import { useProjectStore, type RemovePhotosSnapshot } from "./projectStore";

const UNDO_WINDOW_MS = 5_000;
const RESTORED_NOTICE_MS = 1_500;

export type UndoNotice = "removed" | "restored" | null;

interface UndoState {
  snapshot: RemovePhotosSnapshot | null;
  expiresAt: number | null;
  notice: UndoNotice;
  count: number;
  push: (snapshot: RemovePhotosSnapshot) => void;
  undo: () => void;
  clear: () => void;
}

const timers: {
  expiry: ReturnType<typeof setTimeout> | null;
  restored: ReturnType<typeof setTimeout> | null;
} = import.meta.hot?.data.undoTimers ?? { expiry: null, restored: null };

const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
  if (timer !== null) globalThis.clearTimeout(timer);
};

export const useUndoStore = createSessionStore<UndoState>((set, get) => ({
  snapshot: null,
  expiresAt: null,
  notice: null,
  count: 0,
  push: (snapshot) => {
    if (snapshot.removedPhotos.length === 0) return;
    clearTimer(timers.expiry);
    clearTimer(timers.restored);
    timers.expiry = null;
    timers.restored = null;
    const expiresAt = Date.now() + UNDO_WINDOW_MS;
    set({ snapshot, expiresAt, notice: "removed", count: snapshot.removedPhotos.length });
    timers.expiry = globalThis.setTimeout(() => {
      set({ snapshot: null, expiresAt: null, notice: null, count: 0 });
      timers.expiry = null;
    }, UNDO_WINDOW_MS);
  },
  undo: () => {
    const snapshot = get().snapshot;
    if (!snapshot || (get().expiresAt ?? 0) <= Date.now()) {
      set({ snapshot: null, expiresAt: null, notice: null, count: 0 });
      return;
    }
    clearTimer(timers.expiry);
    timers.expiry = null;
    useProjectStore.getState().restorePhotos(snapshot);
    set({ snapshot: null, expiresAt: null, notice: "restored", count: snapshot.removedPhotos.length });
    timers.restored = globalThis.setTimeout(() => {
      set({ notice: null, count: 0 });
      timers.restored = null;
    }, RESTORED_NOTICE_MS);
  },
  clear: () => {
    clearTimer(timers.expiry);
    clearTimer(timers.restored);
    timers.expiry = null;
    timers.restored = null;
    set({ snapshot: null, expiresAt: null, notice: null, count: 0 });
  },
}), import.meta.hot?.data.undoStore);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.undoStore = useUndoStore;
    data.undoTimers = timers;
  });
}
