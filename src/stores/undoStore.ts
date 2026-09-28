import { create } from "zustand";
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

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let restoredTimer: ReturnType<typeof setTimeout> | null = null;

const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
  if (timer !== null) globalThis.clearTimeout(timer);
};

export const useUndoStore = create<UndoState>((set, get) => ({
  snapshot: null,
  expiresAt: null,
  notice: null,
  count: 0,
  push: (snapshot) => {
    if (snapshot.removedPhotos.length === 0) return;
    clearTimer(expiryTimer);
    clearTimer(restoredTimer);
    expiryTimer = null;
    restoredTimer = null;
    const expiresAt = Date.now() + UNDO_WINDOW_MS;
    set({ snapshot, expiresAt, notice: "removed", count: snapshot.removedPhotos.length });
    expiryTimer = globalThis.setTimeout(() => {
      set({ snapshot: null, expiresAt: null, notice: null, count: 0 });
      expiryTimer = null;
    }, UNDO_WINDOW_MS);
  },
  undo: () => {
    const snapshot = get().snapshot;
    if (!snapshot || (get().expiresAt ?? 0) <= Date.now()) {
      set({ snapshot: null, expiresAt: null, notice: null, count: 0 });
      return;
    }
    clearTimer(expiryTimer);
    expiryTimer = null;
    useProjectStore.getState().restorePhotos(snapshot);
    set({ snapshot: null, expiresAt: null, notice: "restored", count: snapshot.removedPhotos.length });
    restoredTimer = globalThis.setTimeout(() => {
      set({ notice: null, count: 0 });
      restoredTimer = null;
    }, RESTORED_NOTICE_MS);
  },
  clear: () => {
    clearTimer(expiryTimer);
    clearTimer(restoredTimer);
    expiryTimer = null;
    restoredTimer = null;
    set({ snapshot: null, expiresAt: null, notice: null, count: 0 });
  },
}));
