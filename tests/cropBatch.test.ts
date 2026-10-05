import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore, type ProjectPhoto } from '../src/stores/projectStore';
import { DEFAULT_CROP, type CropSpec } from '../src/types/renderSpec';

function photo(id: string, width: number, height: number, crop?: CropSpec): ProjectPhoto {
  return {
    id, path: id, width, height, hash: id, format: 'jpeg', orientation: 1,
    previewUrl: null, thumbUrl: '', thumbRevision: 0, dirty: false,
    spec: { version: 1, source: { path: id, width, height }, crop },
  };
}
const sourceCrop: CropSpec = { aspect: '1:1', enabled: true, rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } };

beforeEach(() => useProjectStore.setState({ photos: [], currentPhotoId: null, selectedIds: [] }));

describe('batch crop application', () => {
  it('centers targets using their own dimensions, preserves source position and other settings, and updates atomically', () => {
    const source = photo('source.jpg', 4000, 3000, structuredClone(sourceCrop));
    const portrait = photo('portrait.jpg', 3000, 4000, { ...structuredClone(DEFAULT_CROP), aspect: 'free', enabled: true });
    const landscape = photo('landscape.jpg', 8000, 4000);
    portrait.spec.output = { format: 'png', quality: 100 };
    landscape.spec.adjustments = { exposure: 1, contrast: 0.1, saturation: 0.2 };
    useProjectStore.setState({ photos: [source, portrait, landscape], currentPhotoId: source.id });
    let writes = 0;
    const unsubscribe = useProjectStore.subscribe(() => { writes += 1; });
    expect(useProjectStore.getState().applyCropToAll(source.id, '1:1')).toBe(2);
    unsubscribe();
    expect(writes).toBe(1);
    const [current, vertical, horizontal] = useProjectStore.getState().photos;
    expect(current.spec).toBe(source.spec);
    expect(current.spec.crop).toEqual(sourceCrop);
    expect(vertical.spec.crop).toEqual({ aspect: '1:1', enabled: true, rect: { x: 0, y: 0.125, width: 1, height: 0.75 } });
    expect(horizontal.spec.crop).toEqual({ aspect: '1:1', enabled: true, rect: { x: 0.25, y: 0, width: 0.5, height: 1 } });
    expect(vertical.spec.output).toEqual(portrait.spec.output);
    expect(horizontal.spec.adjustments).toEqual(landscape.spec.adjustments);
    expect(vertical.spec.source).toEqual(portrait.spec.source);
    expect(horizontal.spec.crop?.rect).not.toBe(vertical.spec.crop?.rect);
    expect(useProjectStore.getState().photos.every(photo => photo.dirty)).toBe(true);
    expect(portrait.spec.crop?.aspect).toBe('free');
  });

  it('keeps later single-photo changes independent and leaves later imports uncropped', () => {
    useProjectStore.setState({ photos: [photo('a.jpg', 4000, 3000, sourceCrop), photo('b.jpg', 3000, 4000), photo('c.jpg', 8000, 4000)] });
    useProjectStore.getState().applyCropToAll('a.jpg', '1:1');
    const before = useProjectStore.getState().photos.map(photo => structuredClone(photo.spec));
    useProjectStore.getState().updateSpec('b.jpg', { crop: { aspect: 'free', enabled: true, rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 } } });
    expect(useProjectStore.getState().photos[0].spec).toEqual(before[0]);
    expect(useProjectStore.getState().photos[2].spec).toEqual(before[2]);
    useProjectStore.getState().addPhotos([photo('new.jpg', 5000, 3000)]);
    const imported = useProjectStore.getState().photos.find(photo => photo.id === 'new.jpg')!;
    expect(imported.spec.crop).toEqual(DEFAULT_CROP);
    expect(imported.dirty).toBe(false);
  });

  it('does nothing for free, original, disabled, stale, missing or single-photo sources', () => {
    for (const crop of [
      { ...sourceCrop, aspect: 'free' as const },
      { ...sourceCrop, aspect: 'original' as const },
      { ...sourceCrop, enabled: false },
      undefined,
    ]) {
      const photos = [photo('a.jpg', 4000, 3000, crop), photo('b.jpg', 3000, 4000)];
      useProjectStore.setState({ photos });
      expect(useProjectStore.getState().applyCropToAll('a.jpg', crop?.aspect ?? '1:1')).toBe(0);
      expect(useProjectStore.getState().photos).toBe(photos);
    }
    const photos = [photo('a.jpg', 4000, 3000, sourceCrop), photo('b.jpg', 3000, 4000)];
    useProjectStore.setState({ photos });
    expect(useProjectStore.getState().applyCropToAll('a.jpg', '16:9')).toBe(0);
    expect(useProjectStore.getState().applyCropToAll('missing.jpg', '1:1')).toBe(0);
    expect(useProjectStore.getState().photos).toBe(photos);
    useProjectStore.setState({ photos: [photos[0]] });
    expect(useProjectStore.getState().applyCropToAll('a.jpg', '1:1')).toBe(0);
    expect(useProjectStore.getState().photos[0].dirty).toBe(false);
  });
});
