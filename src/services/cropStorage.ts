import type { ImageMeta } from '../types/image';
import type { CropSpec, RotationSpec } from '../types/renderSpec';
import { rotatedDimensions } from '../render/rotation';

const PREFIX = 'still.crop.v1:';
type SourceIdentity = Pick<ImageMeta, 'path' | 'width' | 'height' | 'hash'>;
const aspects = new Set(['original', 'free', '1:1', '4:3', '3:2', '16:9', '2:3', '3:4', '9:16']);
export interface PhotoTransform { crop?: CropSpec; rotation?: RotationSpec }

function key(source: SourceIdentity) {
  return PREFIX + JSON.stringify([source.path, source.width, source.height, source.hash ?? null]);
}

/** Compatibility wrapper for crop-only callers; retain an existing rotation. */
export function savePhotoCrop(source: SourceIdentity, crop?: CropSpec) {
  savePhotoTransform(source, { crop, rotation: loadPhotoTransform(source)?.rotation });
}

/** Optional rotation extends existing v1 records; old crop-only records stay valid. */
export function savePhotoTransform(source: SourceIdentity, transform: PhotoTransform) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (transform.crop || transform.rotation) localStorage.setItem(key(source), JSON.stringify({ version: 1, ...transform }));
    else localStorage.removeItem(key(source));
  } catch (error) {
    console.warn('Unable to persist photo transforms', error);
  }
}

export function loadPhotoCrop(source: SourceIdentity): CropSpec | undefined {
  return loadPhotoTransform(source)?.crop;
}

export function loadPhotoTransform(source: SourceIdentity): PhotoTransform | undefined {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(key(source));
    if (!raw) return;
    const value = JSON.parse(raw);
    if (value?.version !== 1) return;
    const transform: PhotoTransform = {};
    const rotation = value.rotation;
    if (rotation !== undefined) {
      if (!rotation || ![0, 90, 180, 270].includes(rotation.angle)
        || typeof rotation.flipH !== 'boolean' || typeof rotation.flipV !== 'boolean') return;
      transform.rotation = { angle: rotation.angle, flipH: rotation.flipH, flipV: rotation.flipV };
    }
    const crop = value?.crop;
    if (crop === undefined) return transform.rotation ? transform : undefined;
    if (!crop || !aspects.has(crop.aspect) || typeof crop.enabled !== 'boolean') return;
    const rect = crop.rect;
    if (!rect || !['x', 'y', 'width', 'height'].every(field => typeof rect[field] === 'number' && Number.isFinite(rect[field]))) return;
    if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
      || rect.x + rect.width > 1 + 1e-10 || rect.y + rect.height > 1 + 1e-10) return;
    if (crop.enabled && crop.aspect !== 'free' && crop.aspect !== 'original') {
      const [w, h] = crop.aspect.split(':').map(Number);
      const size = rotatedDimensions(source.width, source.height, transform.rotation);
      const ratio = rect.width * size.width / (rect.height * size.height);
      if (Math.abs(ratio / (w / h) - 1) > 1e-8) return;
    }
    transform.crop = { aspect: crop.aspect, enabled: crop.enabled, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    return transform;
  } catch {
    // Corrupt or unavailable storage never blocks importing a photo.
    return;
  }
}
