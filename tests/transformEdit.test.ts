import { beforeEach, describe, expect, it } from 'vitest';
import { computeTransformEdit, rotatedDimensions, type TransformAction } from '../src/render/rotation';
import { cropForAspect } from '../src/render/crop';
import { useProjectStore, type ProjectPhoto } from '../src/stores/projectStore';
import { DEFAULT_CROP, DEFAULT_ROTATION, type CropSpec, type RotationSpec } from '../src/types/renderSpec';

const actions: TransformAction[] = ['left', 'right', 'half', 'horizontal', 'vertical'];
const crop: CropSpec = {
  aspect: 'free', enabled: true, rect: { x: 0.125, y: 0.25, width: 0.5, height: 0.625 },
};

function sourceRegion(rotation: RotationSpec, current: CropSpec) {
  const rect = current.rect;
  return [[rect.x, rect.y], [rect.x + rect.width, rect.y],
    [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]]
    .map(([x, y]) => {
      if (rotation.flipH) x = 1 - x;
      if (rotation.flipV) y = 1 - y;
      const point = rotation.angle === 90 ? [y, 1 - x]
        : rotation.angle === 180 ? [1 - x, 1 - y]
        : rotation.angle === 270 ? [1 - y, x] : [x, y];
      return point.map(value => Math.round(value * 1e12) / 1e12).join(',');
    }).sort();
}

function photo(id: string): ProjectPhoto {
  return {
    id, path: id, width: 4000, height: 3000, hash: id, format: 'jpeg', orientation: 1,
    previewUrl: null, thumbUrl: '', thumbRevision: 0, dirty: false,
    spec: { version: 1, source: { path: id, width: 4000, height: 3000 } },
  };
}

beforeEach(() => useProjectStore.setState({ photos: [], selectedId: null, currentPhotoId: null }));

describe('transform button edits', () => {
  it('retains the same source region for every angle, reflection and button operation', () => {
    for (const angle of [0, 90, 180, 270] as const) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const rotation = { angle, flipH, flipV };
          for (const action of actions) {
            const result = computeTransformEdit(rotation, crop, action);
            expect(sourceRegion(result.rotation, result.crop)).toEqual(sourceRegion(rotation, crop));
            expect(result.crop.enabled).toBe(true);
            expect(rotation).toEqual({ angle, flipH, flipV });
          }
        }
      }
    }
  });

  it('adds quarter turns and toggles flips without enabling a disabled crop', () => {
    expect(computeTransformEdit(DEFAULT_ROTATION, DEFAULT_CROP, 'left').rotation.angle).toBe(270);
    expect(computeTransformEdit(DEFAULT_ROTATION, DEFAULT_CROP, 'right').rotation.angle).toBe(90);
    expect(computeTransformEdit(DEFAULT_ROTATION, DEFAULT_CROP, 'half').rotation.angle).toBe(180);
    for (const action of actions) {
      const result = computeTransformEdit(DEFAULT_ROTATION, DEFAULT_CROP, action);
      expect(result.crop).toEqual(DEFAULT_CROP);
      if (action === 'horizontal' || action === 'vertical') {
        expect(computeTransformEdit(result.rotation, result.crop, action).rotation).toEqual(DEFAULT_ROTATION);
      }
    }
  });

  it('swaps fixed aspects on quarter turns while retaining the actual pixel ratio', () => {
    for (const aspect of ['1:1', '4:3', '3:2', '16:9', '2:3', '3:4', '9:16'] as const) {
      const initial = cropForAspect(aspect, 4000, 3000);
      const result = computeTransformEdit(DEFAULT_ROTATION, initial, 'right');
      expect(result.crop.aspect).toBe(aspect.split(':').reverse().join(':'));
      const size = rotatedDimensions(4000, 3000, result.rotation);
      const [numerator, denominator] = result.crop.aspect.split(':').map(Number);
      expect(result.crop.rect.width * size.width / (result.crop.rect.height * size.height))
        .toBeCloseTo(numerator / denominator);
      expect(computeTransformEdit(result.rotation, result.crop, 'left').crop.aspect).toBe(aspect);
      expect(computeTransformEdit(DEFAULT_ROTATION, initial, 'half').crop.aspect).toBe(aspect);
    }
    const rotated = computeTransformEdit(DEFAULT_ROTATION, DEFAULT_CROP, 'right');
    const size = rotatedDimensions(4000, 3000, rotated.rotation);
    const widescreen = cropForAspect('16:9', size.width, size.height);
    expect(widescreen.rect.width * size.width / (widescreen.rect.height * size.height)).toBeCloseTo(16 / 9);
  });

  it('updates only the current photo atomically and accumulates ten rapid clicks', () => {
    const first = photo('first.jpg');
    first.spec.crop = structuredClone(crop);
    const second = photo('second.jpg');
    useProjectStore.setState({ photos: [first, second], selectedId: first.id, currentPhotoId: first.id });
    let writes = 0;
    const unsubscribe = useProjectStore.subscribe(state => {
      writes++;
      const current = state.photos[0].spec;
      expect(sourceRegion(current.rotation!, current.crop!)).toEqual(sourceRegion(DEFAULT_ROTATION, crop));
    });
    try {
      for (let index = 0; index < 10; index++) {
        const store = useProjectStore.getState();
        const spec = store.photos[0].spec;
        store.updateSpec(first.id, computeTransformEdit(spec.rotation ?? DEFAULT_ROTATION, spec.crop ?? DEFAULT_CROP, 'right'));
      }
    } finally {
      unsubscribe();
    }
    expect(writes).toBe(10);
    const [updated, untouched] = useProjectStore.getState().photos;
    expect(updated.spec.rotation?.angle).toBe(180);
    expect(updated.dirty).toBe(true);
    expect(untouched).toBe(second);
  });

  it('preserves the cancellation baseline and draft source regions after a reflected turn', () => {
    const rotation: RotationSpec = { angle: 90, flipH: true, flipV: false };
    const baseline = cropForAspect('16:9', 3000, 4000);
    const draft: CropSpec = { ...crop, rect: { x: 0.2, y: 0.1, width: 0.3, height: 0.4 } };
    for (const current of [baseline, draft]) {
      const next = computeTransformEdit(rotation, current, 'right');
      expect(sourceRegion(next.rotation, next.crop)).toEqual(sourceRegion(rotation, current));
    }
  });
});
