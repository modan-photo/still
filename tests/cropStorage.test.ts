import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../src/stores/projectStore';
import { DEFAULT_BORDER, DEFAULT_CROP, DEFAULT_RENDER_SPEC, DEFAULT_ROTATION, DEFAULT_WATERMARK, type CropSpec } from '../src/types/renderSpec';
import { computeTransformEdit } from '../src/render/rotation';
import { cropForAspect } from '../src/render/crop';

const source = { path: 'persistent.jpg', width: 4000, height: 3000, hash: 'identity', orientation: 1, format: 'jpeg', previewUrl: null, thumbUrl: '' };
const crop: CropSpec = { aspect: '1:1', enabled: true, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } };
const legacyKey = 'still.crop.v1:' + JSON.stringify([source.path, source.width, source.height, source.hash]);
let entries: Map<string, string>;
let getItem: ReturnType<typeof vi.fn>;
let setItem: ReturnType<typeof vi.fn>;
let removeItem: ReturnType<typeof vi.fn>;

beforeEach(() => {
  entries = new Map();
  getItem = vi.fn((key: string) => entries.get(key) ?? null);
  setItem = vi.fn((key: string, value: string) => entries.set(key, value));
  removeItem = vi.fn((key: string) => entries.delete(key));
  vi.stubGlobal('localStorage', { getItem, setItem, removeItem });
  useProjectStore.setState({ photos: [], currentPhotoId: null, selectedIds: [] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function expectNoStorageAccess() {
  expect(getItem).not.toHaveBeenCalled();
  expect(setItem).not.toHaveBeenCalled();
  expect(removeItem).not.toHaveBeenCalled();
}

describe('in-memory photo transforms', () => {
  it('ignores legacy crop and rotation records without accessing storage', () => {
    entries.set(legacyKey, JSON.stringify({ version: 1, crop, rotation: { angle: 90, flipH: true, flipV: false } }));
    useProjectStore.getState().addPhotos([source]);
    expect(useProjectStore.getState().photos[0].spec).toEqual({
      ...DEFAULT_RENDER_SPEC, source: { path: source.path, width: source.width, height: source.height },
    });
    expect(useProjectStore.getState().photos[0].dirty).toBe(false);
    expectNoStorageAccess();
  });

  it('discards edited transforms after starting a fresh workspace', () => {
    const store = useProjectStore.getState();
    store.addPhotos([source]);
    store.updateSpec(source.path, { rotation: { angle: 90, flipH: true, flipV: false }, crop });
    expect(useProjectStore.getState().photos[0].dirty).toBe(true);
    useProjectStore.setState({ photos: [], currentPhotoId: null });
    store.addPhotos([source]);
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(DEFAULT_CROP);
    expect(useProjectStore.getState().photos[0].spec.rotation).toEqual(DEFAULT_ROTATION);
    expect(useProjectStore.getState().photos[0].dirty).toBe(false);
    expectNoStorageAccess();
  });

  it('isolates nested defaults and does not inherit another photo settings', () => {
    const store = useProjectStore.getState();
    store.addPhotos([source]);
    store.updateSpec(source.path, { border: structuredClone(DEFAULT_BORDER), watermark: structuredClone(DEFAULT_WATERMARK), crop, rotation: { angle: 90, flipH: true, flipV: false } });
    const edited = structuredClone(useProjectStore.getState().photos[0].spec);
    store.addPhotos([{ ...source, path: 'second.jpg' }, { ...source, path: 'third.jpg' }]);
    const [first, second, third] = useProjectStore.getState().photos;
    expect(first.spec).toEqual(edited);
    for (const photo of [second, third]) {
      expect(photo.spec).toEqual({ ...DEFAULT_RENDER_SPEC,
        source: { path: photo.path, width: photo.width, height: photo.height } });
      expect(photo.dirty).toBe(false);
      expect(photo.spec.crop?.rect).not.toBe(DEFAULT_RENDER_SPEC.crop?.rect);
      expect(photo.spec.rotation).not.toBe(DEFAULT_RENDER_SPEC.rotation);
    }
    expect(second.spec.crop?.rect).not.toBe(third.spec.crop?.rect);
    expect(second.spec.rotation).not.toBe(third.spec.rotation);
    expectNoStorageAccess();
  });

  it('reimports an existing path as a new clean photo without changing the edited original', () => {
    const store = useProjectStore.getState();
    store.addPhotos([source]);
    store.updateSpec(source.path, { crop, border: structuredClone(DEFAULT_BORDER) });
    const original = useProjectStore.getState().photos[0];
    store.addPhotos([source, source]);
    const photos = useProjectStore.getState().photos;
    expect(photos).toHaveLength(2);
    expect(photos[0]).toBe(original);
    expect(photos[1].id).not.toBe(original.id);
    expect(photos[1].path).toBe(original.path);
    expect(photos[1].spec).toEqual({ ...DEFAULT_RENDER_SPEC, source: original.spec.source });
    expect(photos[1].dirty).toBe(false);
    expect(useProjectStore.getState().currentPhotoId).toBe(original.id);
    expectNoStorageAccess();
  });

  it('keeps ten consecutive rotations in memory and discards them on reimport', () => {
    const store = useProjectStore.getState();
    store.addPhotos([source]);
    store.updateSpec(source.path, { crop: cropForAspect('16:9', 4000, 3000) });
    for (let index = 0; index < 10; index++) {
      const spec = useProjectStore.getState().photos[0].spec;
      store.updateSpec(source.path, computeTransformEdit(spec.rotation ?? DEFAULT_ROTATION, spec.crop!, 'right'));
    }
    expect(useProjectStore.getState().photos[0].spec.rotation?.angle).toBe(180);
    useProjectStore.setState({ photos: [], currentPhotoId: null });
    store.addPhotos([source]);
    expect(useProjectStore.getState().photos[0].spec.rotation).toEqual(DEFAULT_ROTATION);
    expectNoStorageAccess();
  });

  it('keeps batch crop and reset changes in memory without writing storage', () => {
    const store = useProjectStore.getState();
    const portrait = { ...source, path: 'portrait.jpg', width: 3000, height: 4000 };
    store.addPhotos([source, portrait]);
    store.updateSpec(source.path, { crop });
    store.applyCropToAll(source.path, '1:1');
    expect(useProjectStore.getState().photos[1].spec.crop?.rect).toEqual({ x: 0, y: 0.125, width: 1, height: 0.75 });
    store.updateSpec(source.path, { crop: structuredClone(DEFAULT_CROP) });
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(DEFAULT_CROP);
    store.updateSpec(source.path, { rotation: { angle: 270, flipH: true, flipV: true }, crop: cropForAspect('16:9', 3000, 4000) });
    expect(store.applyTransformToAll(source.path, '16:9', true)).toBe(2);
    expect(useProjectStore.getState().photos[1].spec.rotation?.angle).toBe(270);
    expectNoStorageAccess();
  });

  it('does not read corrupt legacy storage', () => {
    entries.set(legacyKey, 'broken json');
    expect(() => useProjectStore.getState().addPhotos([source])).not.toThrow();
    expectNoStorageAccess();
  });

  it('allows editing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    useProjectStore.getState().addPhotos([source]);
    useProjectStore.getState().updateSpec(source.path, { crop });
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(crop);
  });

  it('does not access denied storage during editing', () => {
    getItem.mockImplementation(() => { throw new Error('storage denied'); });
    setItem.mockImplementation(() => { throw new Error('quota exceeded'); });
    expect(() => useProjectStore.getState().addPhotos([source])).not.toThrow();
    expect(() => useProjectStore.getState().updateSpec(source.path, { crop })).not.toThrow();
    expect(useProjectStore.getState().photos[0].spec.crop).toEqual(crop);
    expectNoStorageAccess();
  });
});
