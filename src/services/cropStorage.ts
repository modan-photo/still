import type { ImageMeta } from '../types/image';
import type { CropSpec } from '../types/renderSpec';

const PREFIX = 'still.crop.v1:';
type SourceIdentity = Pick<ImageMeta, 'path' | 'width' | 'height' | 'hash'>;
const aspects = new Set(['original', 'free', '1:1', '4:3', '3:2', '16:9', '2:3', '3:4', '9:16']);

function key(source: SourceIdentity) {
  return PREFIX + JSON.stringify([source.path, source.width, source.height, source.hash ?? null]);
}

/** Persist only the crop fragment of RenderSpec; previews and transient drag state are excluded. */
export function savePhotoCrop(source: SourceIdentity, crop?: CropSpec) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (crop) localStorage.setItem(key(source), JSON.stringify({ version: 1, crop }));
    else localStorage.removeItem(key(source));
  } catch (error) {
    console.warn('Unable to persist photo crop', error);
  }
}

export function loadPhotoCrop(source: SourceIdentity): CropSpec | undefined {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(key(source));
    if (!raw) return;
    const value = JSON.parse(raw);
    const crop = value?.crop;
    if (value?.version !== 1 || !crop || !aspects.has(crop.aspect) || typeof crop.enabled !== 'boolean') return;
    const rect = crop.rect;
    if (!rect || !['x', 'y', 'width', 'height'].every(field => typeof rect[field] === 'number' && Number.isFinite(rect[field]))) return;
    if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
      || rect.x + rect.width > 1 + 1e-10 || rect.y + rect.height > 1 + 1e-10) return;
    if (crop.enabled && crop.aspect !== 'free' && crop.aspect !== 'original') {
      const [w, h] = crop.aspect.split(':').map(Number);
      const ratio = rect.width * source.width / (rect.height * source.height);
      if (Math.abs(ratio / (w / h) - 1) > 1e-8) return;
    }
    return { aspect: crop.aspect, enabled: crop.enabled, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
  } catch {
    // Corrupt or unavailable storage never blocks importing a photo.
    return;
  }
}
