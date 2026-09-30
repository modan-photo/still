import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPhotoCrop, loadPhotoTransform, savePhotoCrop, savePhotoTransform } from '../src/services/cropStorage';
import { useProjectStore } from '../src/stores/projectStore';
import { DEFAULT_CROP, DEFAULT_ROTATION, type CropSpec } from '../src/types/renderSpec';
import { computeTransformEdit, rotatedDimensions } from '../src/render/rotation';
import { cropForAspect } from '../src/render/crop';

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
  it('loads old crop-only records without adding a rotation or rewriting storage', () => {
    const key = 'still.crop.v1:' + JSON.stringify([source.path, source.width, source.height, source.hash]);
    entries.set(key, JSON.stringify({ version: 1, crop }));
    useProjectStore.getState().addPhotos([source]);
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(crop);
    expect(useProjectStore.getState().photos[0].spec.rotation).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('restores rotation and crop together and validates ratios in rotated space', () => {
    const store = useProjectStore.getState();
    store.addPhotos([source]);
    store.updateSpec(source.path, {
      rotation: { angle: 90, flipH: true, flipV: false },
      crop: cropForAspect('16:9', 3000, 4000),
    });
    const saved = structuredClone(useProjectStore.getState().photos[0].spec);
    expect(setItem).toHaveBeenCalledTimes(1);
    useProjectStore.setState({ photos: [], selectedId: null, currentPhotoId: null });
    store.addPhotos([source]);
    expect(useProjectStore.getState().photos[0].spec).toEqual(saved);
    expect(useProjectStore.getState().photos[0].dirty).toBe(true);
    expect(loadPhotoCrop(source)).toEqual(saved.crop);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it('persists rotation without cropping, and restores a reset as clean', () => {
    const store = useProjectStore.getState();
    store.addPhotos([source]);
    store.updateSpec(source.path, { rotation: { angle: 270, flipH: false, flipV: true } });
    useProjectStore.setState({ photos: [], selectedId: null, currentPhotoId: null });
    store.addPhotos([source]);
    expect(useProjectStore.getState().photos[0].spec.rotation?.angle).toBe(270);
    expect(useProjectStore.getState().photos[0].spec.crop).toBeUndefined();
    expect(useProjectStore.getState().photos[0].dirty).toBe(true);
    store.updateSpec(source.path, { rotation: structuredClone(DEFAULT_ROTATION), crop: structuredClone(DEFAULT_CROP) });
    useProjectStore.setState({ photos: [], selectedId: null, currentPhotoId: null });
    store.addPhotos([source]);
    expect(useProjectStore.getState().photos[0].spec.rotation).toEqual(DEFAULT_ROTATION);
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(DEFAULT_CROP);
    expect(useProjectStore.getState().photos[0].dirty).toBe(false);
  });

  it('preserves rotation through the crop-only compatibility wrapper', () => {
    const rotation = { angle: 180 as const, flipH: true, flipV: false };
    savePhotoTransform(source, { rotation });
    savePhotoCrop(source, crop);
    expect(loadPhotoTransform(source)).toEqual({ rotation, crop });
    savePhotoCrop(source, undefined);
    expect(loadPhotoTransform(source)).toEqual({ rotation });
  });

  it('rejects invalid rotation fields instead of interpreting crop in the wrong space', () => {
    savePhotoTransform(source, { crop, rotation: DEFAULT_ROTATION });
    const key = [...entries.keys()][0];
    for (const rotation of [
      { angle: 45, flipH: false, flipV: false },
      { angle: 360, flipH: false, flipV: false },
      { angle: -90, flipH: false, flipV: false },
      { angle: 90.5, flipH: false, flipV: false },
      { angle: '90', flipH: false, flipV: false },
      { angle: 90, flipH: 'false', flipV: false },
      { angle: 90, flipH: false }, null,
    ]) {
      entries.set(key, JSON.stringify({ version: 1, crop, rotation }));
      expect(loadPhotoTransform(source)).toBeUndefined();
    }
  });

  it('restores the final state after ten consecutive rotations without leaking edits', () => {
    const store = useProjectStore.getState();
    const other = { ...source, path: 'other.jpg' };
    store.addPhotos([source, other]);
    store.updateSpec(source.path, { crop: cropForAspect('16:9', 4000, 3000) });
    for (let index = 0; index < 10; index++) {
      const spec = useProjectStore.getState().photos[0].spec;
      store.updateSpec(source.path, computeTransformEdit(spec.rotation ?? DEFAULT_ROTATION, spec.crop!, 'right'));
    }
    const expected = structuredClone(useProjectStore.getState().photos[0].spec);
    useProjectStore.setState({ photos: [], selectedId: null, currentPhotoId: null });
    store.addPhotos([source, other]);
    expect(useProjectStore.getState().photos[0].spec).toEqual(expected);
    expect(expected.rotation?.angle).toBe(180);
    expect(useProjectStore.getState().photos[1].dirty).toBe(false);
    expect(useProjectStore.getState().photos[1].spec.rotation).toBeUndefined();
  });

  it('restores all batch results using each photo identity and final orientation', () => {
    const store = useProjectStore.getState();
    const portrait = { ...source, path: 'portrait.jpg', width: 2000, height: 4000 };
    store.addPhotos([source, portrait]);
    store.updateSpec(source.path, { rotation: { angle: 270, flipH: true, flipV: true }, crop: cropForAspect('16:9', 3000, 4000) });
    expect(store.applyTransformToAll(source.path, '16:9', true)).toBe(2);
    const expected = useProjectStore.getState().photos.map(photo => structuredClone(photo.spec));
    useProjectStore.setState({ photos: [], selectedId: null, currentPhotoId: null });
    store.addPhotos([source, portrait]);
    useProjectStore.getState().photos.forEach((photo, index) => {
      expect(photo.spec).toEqual(expected[index]);
      const size = rotatedDimensions(photo.width, photo.height, photo.spec.rotation);
      expect(photo.spec.crop).toEqual(cropForAspect('16:9', size.width, size.height));
    });
    expect(loadPhotoTransform({ ...source, hash: 'changed' })).toBeUndefined();
  });

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
