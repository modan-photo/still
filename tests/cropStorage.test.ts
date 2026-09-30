import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPhotoCrop, savePhotoCrop } from '../src/services/cropStorage';
import { useProjectStore } from '../src/stores/projectStore';
import { DEFAULT_CROP, type CropSpec } from '../src/types/renderSpec';

const source = { path: 'persistent.jpg', width: 4000, height: 3000, hash: 'identity', orientation: 1, format: 'jpeg', previewUrl: null, thumbUrl: '' };
const crop: CropSpec = { aspect: '1:1', enabled: true, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } };
let entries: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;
beforeEach(() => {
  entries = new Map();
  setItem = vi.fn((key: string, value: string) => { entries.set(key, value); });
  vi.stubGlobal('localStorage', { getItem: (key: string) => entries.get(key) ?? null, setItem, removeItem: (key: string) => entries.delete(key) });
  useProjectStore.setState({ photos: [], selectedId: null, currentPhotoId: null, selectedIds: [] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('crop persistence boundaries', () => {
  it('restores committed crop after a fresh import without applying it to new identities', () => {
    const store = useProjectStore.getState();
    store.addPhotos([source]);
    store.updateSpec(source.path, { crop });
    expect(setItem).toHaveBeenCalledTimes(1);
    useProjectStore.setState({ photos: [], selectedId: null, currentPhotoId: null });
    store.addPhotos([source, { ...source, path: 'new.jpg' }]);
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(crop);
    expect(useProjectStore.getState().photos[0].dirty).toBe(true);
    expect(useProjectStore.getState().photos[1].spec.crop).toBeUndefined();
    expect(loadPhotoCrop({ ...source, hash: 'replaced-image' })).toBeUndefined();
    expect(loadPhotoCrop({ ...source, width: 3000, height: 4000 })).toBeUndefined();
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('persists reset and each batch target, while unrelated settings do not write', () => {
    const store = useProjectStore.getState();
    const portrait = { ...source, path: 'portrait.jpg', width: 3000, height: 4000 };
    store.addPhotos([source, portrait]);
    store.updateSpec(source.path, { crop });
    store.updateSpec(source.path, { output: { format: 'png', quality: 100 } });
    expect(setItem).toHaveBeenCalledTimes(1);
    store.applyCropToAll(source.path, '1:1');
    expect(loadPhotoCrop(portrait)?.rect).toEqual({ x: 0, y: 0.125, width: 1, height: 0.75 });
    expect(setItem).toHaveBeenCalledTimes(2);
    store.updateSpec(source.path, { crop: structuredClone(DEFAULT_CROP) });
    expect(loadPhotoCrop(source)).toEqual(DEFAULT_CROP);
  });

  it('ignores corrupt, out-of-bounds, invalid-ratio and unknown-version storage', () => {
    savePhotoCrop(source, crop);
    const key = [...entries.keys()][0];
    for (const value of [
      'broken json', JSON.stringify({ version: 2, crop }),
      JSON.stringify({ version: 1, crop: { ...crop, aspect: 'unknown' } }),
      JSON.stringify({ version: 1, crop: { ...crop, rect: { ...crop.rect, x: 0.9 } } }),
      JSON.stringify({ version: 1, crop: { ...crop, rect: { ...crop.rect, width: 0.5 } } }),
      JSON.stringify({ version: 1, crop: { ...crop, rect: { ...crop.rect, width: null } } }),
    ]) {
      entries.set(key, value);
      expect(loadPhotoCrop(source)).toBeUndefined();
    }
    expect(() => useProjectStore.getState().addPhotos([source])).not.toThrow();
    expect(useProjectStore.getState().photos[0].spec.crop).toBeUndefined();
  });

  it('allows editing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    useProjectStore.getState().addPhotos([source]);
    useProjectStore.getState().updateSpec(source.path, { crop });
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(crop);
    expect(loadPhotoCrop(source)).toBeUndefined();
  });

  it('keeps in-memory edits when storage reads or writes fail', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => { throw new Error('quota exceeded'); },
    });
    expect(() => useProjectStore.getState().addPhotos([source])).not.toThrow();
    expect(() => useProjectStore.getState().updateSpec(source.path, { crop })).not.toThrow();
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(crop);
    expect(warning).toHaveBeenCalledOnce();
  });
});
