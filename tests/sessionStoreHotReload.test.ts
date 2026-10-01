import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionStore } from '../src/stores/createSessionStore';

interface ExampleSession {
  photos: Array<{ id: string; spec: { rotation: number } }>;
  selectedIds: string[];
  count: number;
  increment: () => void;
}

afterEach(() => vi.unstubAllGlobals());

describe('session memory across hot reload', () => {
  it('retains the store and edited data while updating actions and notifying existing subscribers', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    const original = createSessionStore<ExampleSession>((set, get) => ({
      photos: [], selectedIds: [], count: 0,
      increment: () => set({ count: get().count + 1 }),
    }));
    original.setState({ photos: [{ id: 'photo', spec: { rotation: 90 } }], selectedIds: ['photo'], count: 5 });
    const before = original.getState();
    const listener = vi.fn();
    const unsubscribe = original.subscribe(listener);

    const reloaded = createSessionStore<ExampleSession>((set, get) => ({
      photos: [], selectedIds: [], count: 0,
      increment: () => set({ count: get().count + 2 }),
    }), original);
    expect(reloaded).toBe(original);
    expect(reloaded.getState().photos).toBe(before.photos);
    expect(reloaded.getState().selectedIds).toBe(before.selectedIds);
    expect(reloaded.getState().count).toBe(5);
    expect(reloaded.getState().increment).not.toBe(before.increment);
    reloaded.getState().increment();
    expect(original.getState().count).toBe(7);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(setItem).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('updates getters and setters on the existing store through repeated reloads', () => {
    let store = createSessionStore<{ count: number; increment: () => void }>((set, get) => ({
      count: 0, increment: () => set({ count: get().count + 1 }),
    }));
    const original = store;
    for (let step = 1; step <= 10; step++) {
      store = createSessionStore((set, get) => ({
        count: 0, increment: () => set({ count: get().count + step }),
      }), store);
      store.getState().increment();
    }
    expect(store).toBe(original);
    expect(store.getState().count).toBe(55);
  });

  it('starts empty in a new window or process without shared hot data', () => {
    const first = createSessionStore<{ photos: string[] }>(() => ({ photos: [] }));
    first.setState({ photos: ['old.jpg'] });
    const second = createSessionStore<{ photos: string[] }>(() => ({ photos: [] }));
    expect(second).not.toBe(first);
    expect(second.getState().photos).toEqual([]);
    expect(first.getState().photos).toEqual(['old.jpg']);
  });

  it('preserves real workspace edits, selection and undo data on store refresh', async () => {
    const { useProjectStore } = await import('../src/stores/projectStore');
    const { useUIStore } = await import('../src/stores/uiStore');
    const { useUndoStore } = await import('../src/stores/undoStore');
    useProjectStore.getState().resetSession();
    useUndoStore.getState().clear();
    useProjectStore.getState().addPhotos([{ path: 'photo.jpg', width: 100, height: 100, hash: '', format: 'jpeg', orientation: 1, previewUrl: null, thumbUrl: '' }]);
    useProjectStore.getState().updateSpec('photo.jpg', { rotation: { angle: 90, flipH: true, flipV: false } });
    useProjectStore.getState().setSelectedIds(['photo.jpg']);
    useProjectStore.getState().updateCollageDraft({ photoIds: ['photo.jpg'], gap: 42 });
    useUIStore.getState().setActiveRightTab('transform');
    useUndoStore.getState().push({ removedPhotos: [...useProjectStore.getState().photos], removedIndices: [0], previousCurrentId: 'photo.jpg', previousSelectedIds: ['photo.jpg'], previousCollagePhotoIds: ['photo.jpg'] });
    const photos = useProjectStore.getState().photos;
    const snapshot = useUndoStore.getState().snapshot;

    createSessionStore(() => ({ ...useProjectStore.getInitialState() }), useProjectStore);
    createSessionStore(() => ({ ...useUIStore.getInitialState() }), useUIStore);
    createSessionStore(() => ({ ...useUndoStore.getInitialState() }), useUndoStore);
    expect(useProjectStore.getState().photos).toBe(photos);
    expect(useProjectStore.getState().photos[0].spec.rotation?.angle).toBe(90);
    expect(useProjectStore.getState().selectedIds).toEqual(['photo.jpg']);
    expect(useProjectStore.getState().collageDraft.gap).toBe(42);
    expect(useUIStore.getState().activeRightTab).toBe('transform');
    expect(useUndoStore.getState().snapshot).toBe(snapshot);
    useUndoStore.getState().clear();
    useProjectStore.getState().resetSession();
    useUIStore.getState().resetSession();
  });
});
