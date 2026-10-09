import { createSessionStore } from './createSessionStore';
import type { RenderSpec } from '../types/renderSpec';

export interface EditPhotoState {
  spec: RenderSpec;
  dirty: boolean;
}

export interface EditChange {
  id: string;
  before: EditPhotoState;
  after: EditPhotoState;
}

export interface EditStep {
  changes: EditChange[];
  mergeKey: string | null;
  time: number;
}

interface EditHistoryState {
  undoStack: EditStep[];
  redoStack: EditStep[];
  appliedRevision: number;
  push: (changes: EditChange[], mergeKey?: string) => void;
  takeUndo: () => EditStep | null;
  takeRedo: () => EditStep | null;
  prunePhotos: (ids: string[]) => void;
  clear: () => void;
}

const MAX_STEPS = 50;
const MERGE_WINDOW_MS = 400;

export const useEditHistoryStore = createSessionStore<EditHistoryState>(
  (set, get) => ({
    undoStack: [],
    redoStack: [],
    appliedRevision: 0,
    push: (changes, mergeKey) => {
      if (!changes.length) return;
      const time = Date.now();
      const state = get();
      const previous = state.undoStack[state.undoStack.length - 1];
      if (
        mergeKey &&
        previous?.mergeKey === mergeKey &&
        time - previous.time <= MERGE_WINDOW_MS &&
        state.redoStack.length === 0
      ) {
        const updated = structuredClone(previous);
        for (const change of changes) {
          const old = updated.changes.find((entry) => entry.id === change.id);
          if (old) old.after = structuredClone(change.after);
          else updated.changes.push(structuredClone(change));
        }
        updated.time = time;
        set({ undoStack: [...state.undoStack.slice(0, -1), updated] });
        return;
      }
      set({
        undoStack: [
          ...state.undoStack,
          { changes: structuredClone(changes), mergeKey: mergeKey ?? null, time },
        ].slice(-MAX_STEPS),
        redoStack: [],
      });
    },
    takeUndo: () => {
      const state = get();
      const step = state.undoStack[state.undoStack.length - 1];
      if (!step) return null;
      set({
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, step],
        appliedRevision: state.appliedRevision + 1,
      });
      return step;
    },
    takeRedo: () => {
      const state = get();
      const step = state.redoStack[state.redoStack.length - 1];
      if (!step) return null;
      set({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, step],
        appliedRevision: state.appliedRevision + 1,
      });
      return step;
    },
    prunePhotos: (ids) => {
      const removed = new Set(ids);
      const retain = (stack: EditStep[]) =>
        stack
          .map((step) => ({
            ...step,
            changes: step.changes.filter((change) => !removed.has(change.id)),
          }))
          .filter((step) => step.changes.length > 0);
      set((state) => ({ undoStack: retain(state.undoStack), redoStack: retain(state.redoStack) }));
    },
    clear: () => set({ undoStack: [], redoStack: [] }),
  }),
  import.meta.hot?.data.editHistoryStore,
);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.editHistoryStore = useEditHistoryStore;
  });
}
