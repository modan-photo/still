import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore, type ProjectPhoto } from '../src/stores/projectStore';
import { DEFAULT_CROP, DEFAULT_ROTATION, type CropAspect, type RotationSpec } from '../src/types/renderSpec';
import { cropForAspect } from '../src/render/crop';
import { rotatedDimensions, transformBatchDisabledReason } from '../src/render/rotation';

function photo(id: string, width: number, height: number, rotation?: RotationSpec): ProjectPhoto {
  return {
    id, path: id, width, height, hash: id, format: 'jpeg', orientation: 1,
    previewUrl: null, thumbUrl: '', thumbRevision: 0, dirty: false,
    spec: { version: 1, source: { path: id, width, height }, rotation },
  };
}

function fixture(aspect: CropAspect = '16:9', rotation: RotationSpec = { angle: 90, flipH: true, flipV: false }) {
  const source = photo('source.jpg', 4000, 3000, rotation);
  source.spec.crop = { aspect, enabled: aspect !== 'original', rect: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 } };
  const target = photo('portrait.jpg', 2000, 4000, { angle: 270, flipH: false, flipV: true });
  target.spec.crop = { ...structuredClone(DEFAULT_CROP), enabled: true, aspect: 'free' };
  target.spec.output = { format: 'png', quality: 100 };
  const landscape = photo('landscape.jpg', 6000, 3000);
  useProjectStore.setState({ photos: [source, target, landscape], currentPhotoId: source.id });
  return { source, target, landscape };
}

function expectCentered(photo: ProjectPhoto, aspect: CropAspect) {
  const size = rotatedDimensions(photo.spec.source.width, photo.spec.source.height, photo.spec.rotation);
  expect(photo.spec.crop).toEqual(cropForAspect(aspect, size.width, size.height));
  const rect = photo.spec.crop!.rect;
  expect(rect.x + rect.width / 2).toBeCloseTo(0.5);
  expect(rect.y + rect.height / 2).toBeCloseTo(0.5);
  expect(Math.max(rect.width, rect.height)).toBeCloseTo(1);
}

beforeEach(() => useProjectStore.setState({ photos: [], currentPhotoId: null, selectedIds: [] }));

describe('batch transform application', () => {
  it('preserves each rotation by default and centers every crop in one store update', () => {
    const { source, target, landscape } = fixture();
    let writes = 0;
    const unsubscribe = useProjectStore.subscribe(() => { writes++; });
    expect(useProjectStore.getState().applyTransformToAll(source.id, '16:9')).toBe(3);
    unsubscribe();
    expect(writes).toBe(1);
    const result = useProjectStore.getState().photos;
    result.forEach((entry, index) => {
      expect(entry.spec.rotation).toEqual([source, target, landscape][index].spec.rotation);
      expectCentered(entry, '16:9');
      expect(entry.dirty).toBe(true);
      expect(entry.spec.source).toBe([source, target, landscape][index].spec.source);
    });
    expect(result[1].spec.output).toEqual(target.spec.output);
    expect(result[2].spec.rotation).toBeUndefined();
  });

  it('copies every angle and flip combination when checked, before computing crops', () => {
    for (const angle of [0, 90, 180, 270] as const) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const rotation = { angle, flipH, flipV };
          const { source } = fixture('16:9', rotation);
          expect(useProjectStore.getState().applyTransformToAll(source.id, '16:9', true, rotation)).toBe(3);
          const result = useProjectStore.getState().photos;
          for (const entry of result) {
            expect(entry.spec.rotation).toEqual(rotation);
            expect(entry.spec.rotation).not.toBe(rotation);
            expectCentered(entry, '16:9');
          }
          expect(result[0].spec.rotation).not.toBe(result[1].spec.rotation);
        }
      }
    }
  });

  it('allows Original with a non-default rotation and clears all crops', () => {
    for (const includeRotation of [false, true]) {
      const { source, target } = fixture('original');
      expect(useProjectStore.getState().applyTransformToAll(source.id, 'original', includeRotation)).toBe(3);
      const result = useProjectStore.getState().photos;
      expect(result.every(entry => entry.dirty)).toBe(true);
      result.forEach(entry => expect(entry.spec.crop).toEqual(DEFAULT_CROP));
      expect(result[1].spec.rotation).toEqual(includeRotation ? source.spec.rotation : target.spec.rotation);
    }
  });

  it('allows a rotation-only legacy spec without a crop field', () => {
    const { source } = fixture('original');
    useProjectStore.getState().updateSpec(source.id, { crop: undefined });
    expect(useProjectStore.getState().applyTransformToAll(source.id, 'original', true)).toBe(3);
    useProjectStore.getState().photos.forEach(entry => {
      expect(entry.spec.rotation).toEqual(source.spec.rotation);
      expect(entry.spec.crop).toEqual(DEFAULT_CROP);
    });
  });

  it('rejects stale confirmation snapshots and missing sources without changing photos', () => {
    const { source } = fixture();
    const before = useProjectStore.getState().photos;
    expect(useProjectStore.getState().applyTransformToAll(source.id, '1:1', true)).toBe(0);
    expect(useProjectStore.getState().applyTransformToAll(source.id, '16:9', true, DEFAULT_ROTATION)).toBe(0);
    expect(useProjectStore.getState().applyTransformToAll('missing', '16:9', true)).toBe(0);
    expect(useProjectStore.getState().photos).toBe(before);
  });

  it('blocks free ratios, Original without transforms, and single-photo projects', () => {
    for (const [aspect, rotation, count] of [
      ['free', { ...DEFAULT_ROTATION, angle: 90 }, 3],
      ['original', DEFAULT_ROTATION, 3],
      ['16:9', DEFAULT_ROTATION, 1],
    ] as const) {
      const { source } = fixture(aspect, rotation);
      if (count === 1) useProjectStore.setState({ photos: [source] });
      const before = useProjectStore.getState().photos;
      expect(useProjectStore.getState().applyTransformToAll(source.id, aspect, true)).toBe(0);
      expect(useProjectStore.getState().photos).toBe(before);
    }
  });

  it('provides the required disabled reasons and allows flips without cropping', () => {
    expect(transformBatchDisabledReason({ ...DEFAULT_CROP, aspect: 'free' }, DEFAULT_ROTATION, 3))
      .toBe('Free aspect ratios cannot be applied to all photos');
    expect(transformBatchDisabledReason(DEFAULT_CROP, DEFAULT_ROTATION, 3)).toBe('No transforms to apply');
    expect(transformBatchDisabledReason({ ...DEFAULT_CROP, aspect: '1:1' }, DEFAULT_ROTATION, 1)).toBe('Only one photo');
    expect(transformBatchDisabledReason(DEFAULT_CROP, { ...DEFAULT_ROTATION, flipH: true }, 3)).toBe('');
    expect(transformBatchDisabledReason(DEFAULT_CROP, { ...DEFAULT_ROTATION, flipV: true }, 3)).toBe('');
  });
});
