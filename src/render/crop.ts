import { DEFAULT_CROP, type CropAspect, type CropSpec } from '../types/renderSpec';

/** Fixed aspect ratios describe display-oriented pixels, not normalized width / height. */
export function cropForAspect(
  aspect: CropAspect,
  sourceWidth: number,
  sourceHeight: number,
  current: CropSpec = DEFAULT_CROP,
): CropSpec {
  if (aspect === 'original') return structuredClone(DEFAULT_CROP);
  if (aspect === 'free') {
    return { aspect, enabled: true, rect: { ...(current.enabled ? current.rect : DEFAULT_CROP.rect) } };
  }
  if (current.enabled && current.aspect === aspect) return structuredClone(current);

  const rect = current.enabled ? current.rect : DEFAULT_CROP.rect;
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const [numerator, denominator] = aspect.split(':').map(Number);
  const normalizedRatio = (numerator / denominator) / (sourceWidth / sourceHeight);
  // Preserve the existing area when changing ratios, then shrink uniformly to fit.
  // A previously disabled crop starts with the largest rectangle of the new ratio.
  const area = rect.width * rect.height;
  let width = Math.sqrt(area * normalizedRatio);
  let height = width / normalizedRatio;
  const maxWidth = 2 * Math.min(centerX, 1 - centerX);
  const maxHeight = 2 * Math.min(centerY, 1 - centerY);
  const fit = Math.min(1, maxWidth / width, maxHeight / height);
  width *= fit;
  height *= fit;
  return {
    aspect,
    enabled: true,
    rect: { x: centerX - width / 2, y: centerY - height / 2, width, height },
  };
}

export interface CropPixelRect { x: number; y: number; width: number; height: number }

/** Matches Rust crop.rs: clamp normalized coordinates, round origin and size independently. */
export function cropPixelRect(width: number, height: number, crop?: CropSpec): CropPixelRect {
  if (!crop?.enabled || width === 0 || height === 0) return { x: 0, y: 0, width, height };
  const horizontal = pixelBounds(crop.rect.x, crop.rect.width, width);
  const vertical = pixelBounds(crop.rect.y, crop.rect.height, height);
  return { x: horizontal.origin, y: vertical.origin, width: horizontal.size, height: vertical.size };
}

function pixelBounds(start: number, length: number, extent: number) {
  start = Number.isFinite(start) ? Math.max(0, Math.min(1, start)) : 0;
  length = Number.isFinite(length) ? Math.max(0, Math.min(1 - start, length)) : 0;
  const origin = Math.min(extent - 1, Math.round(start * extent));
  const size = Math.min(extent - origin, Math.max(1, Math.round(length * extent)));
  return { origin, size };
}

/** Source pixels are already normalized to their EXIF display orientation by the cache. */
export function applyCropToCanvas(
  ctx: CanvasRenderingContext2D,
  src: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  crop: CropSpec,
  destWidth: number,
  destHeight: number,
): void {
  const width = 'naturalWidth' in src ? src.naturalWidth : src.width;
  const height = 'naturalHeight' in src ? src.naturalHeight : src.height;
  const rect = cropPixelRect(width, height, crop);
  if (rect.width === 0 || rect.height === 0 || destWidth <= 0 || destHeight <= 0) return;
  ctx.drawImage(src, rect.x, rect.y, rect.width, rect.height, 0, 0, destWidth, destHeight);
}

/** Retains cached pixel density; only the subsequent canvas display scales the preview. */
export function renderCroppedPreview(image: HTMLImageElement | HTMLCanvasElement, crop: CropSpec): HTMLCanvasElement {
  const width = 'naturalWidth' in image ? image.naturalWidth : image.width;
  const height = 'naturalHeight' in image ? image.naturalHeight : image.height;
  const rect = cropPixelRect(width, height, crop);
  const layer = document.createElement('canvas');
  layer.width = rect.width;
  layer.height = rect.height;
  const context = layer.getContext('2d');
  if (context) applyCropToCanvas(context, image, crop, layer.width, layer.height);
  return layer;
}
