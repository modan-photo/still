import { DEFAULT_ROTATION, type CropAspect, type CropRect, type CropSpec, type RotationSpec } from '../types/renderSpec';

export type TransformAction = 'left' | 'right' | 'half' | 'horizontal' | 'vertical';

export function isDefaultRotation(rotation: RotationSpec = DEFAULT_ROTATION): boolean {
  return rotation.angle === 0 && !rotation.flipH && !rotation.flipV;
}

export function transformBatchDisabledReason(crop: CropSpec, rotation: RotationSpec, photoCount: number): string {
  if (crop.aspect === 'free') return 'Free aspect ratios cannot be applied to all photos';
  if (crop.aspect === 'original' && isDefaultRotation(rotation)) return 'No transforms to apply';
  if (photoCount < 2) return 'Only one photo';
  return '';
}

/** Derive one atomic edit while preserving the crop's selected source pixels. */
export function computeTransformEdit(rotation: RotationSpec, crop: CropSpec, action: TransformAction) {
  if (action === 'horizontal' || action === 'vertical') {
    return {
      rotation: { ...rotation, ...(action === 'horizontal' ? { flipH: !rotation.flipH } : { flipV: !rotation.flipV }) },
      crop: { ...crop, rect: flipCropRect(crop.rect, action === 'horizontal' ? 'h' : 'v') },
    };
  }
  const delta = action === 'left' ? 270 : action === 'right' ? 90 : 180;
  // Existing display-space reflection reverses the visible rotation of the crop.
  const cropDelta = rotation.flipH !== rotation.flipV && delta !== 180
    ? (360 - delta) as 90 | 270 : delta;
  let aspect = crop.aspect;
  if (delta !== 180 && aspect !== 'free' && aspect !== 'original') {
    aspect = aspect.split(':').reverse().join(':') as CropAspect;
  }
  return {
    rotation: { ...rotation, angle: ((rotation.angle + delta) % 360) as RotationSpec['angle'] },
    crop: { ...crop, aspect, rect: rotateCropRect(crop.rect, cropDelta) },
  };
}

/** Move a normalized crop with a clockwise quarter turn, without rounding or trig. */
export function rotateCropRect(rect: CropRect, angleDelta: 90 | 180 | 270): CropRect {
  const { x, y, width, height } = rect;
  switch (angleDelta) {
    case 90:
      return { x: oppositeOrigin(y, height), y: x, width: height, height: width };
    case 180:
      return { x: oppositeOrigin(x, width), y: oppositeOrigin(y, height), width, height };
    case 270:
      return { x: y, y: oppositeOrigin(x, width), width: height, height: width };
  }
}

/** Flips apply in the current rotated display space; dimensions remain unchanged. */
export function flipCropRect(rect: CropRect, axis: 'h' | 'v'): CropRect {
  return axis === 'h'
    ? { ...rect, x: oppositeOrigin(rect.x, rect.width) }
    : { ...rect, y: oppositeOrigin(rect.y, rect.height) };
}

function oppositeOrigin(start: number, length: number): number {
  // A crop touching the far edge must stay at zero despite floating-point residue.
  return Math.max(0, 1 - start - length);
}

export interface RotationTransform {
  drawWidth: number;
  drawHeight: number;
  translateX: number;
  translateY: number;
  angleRad: number;
  scaleX: number;
  scaleY: number;
}

export function rotatedDimensions(width: number, height: number, spec: RotationSpec = DEFAULT_ROTATION) {
  return spec.angle === 90 || spec.angle === 270
    ? { width: height, height: width }
    : { width, height };
}

/** Center a contained image; apply translate, scale, rotate, then draw centered. */
export function computeRotationTransform(
  srcW: number,
  srcH: number,
  spec: RotationSpec,
  containerW: number,
  containerH: number,
): RotationTransform {
  const target = rotatedDimensions(srcW, srcH, spec);
  const fit = srcW > 0 && srcH > 0 && containerW > 0 && containerH > 0
    ? Math.min(containerW / target.width, containerH / target.height) : 0;
  return {
    drawWidth: srcW * fit,
    drawHeight: srcH * fit,
    translateX: containerW / 2,
    translateY: containerH / 2,
    angleRad: spec.angle * Math.PI / 180,
    scaleX: spec.flipH ? -1 : 1,
    scaleY: spec.flipV ? -1 : 1,
  };
}

/** Preserve cached pixel density; only the final displayed canvas scales to fit. */
export function renderRotatedPreview(
  image: HTMLImageElement,
  spec: RotationSpec = DEFAULT_ROTATION,
): HTMLImageElement | HTMLCanvasElement {
  if (spec.angle === 0 && !spec.flipH && !spec.flipV) return image;
  const layer = document.createElement('canvas');
  const size = rotatedDimensions(image.naturalWidth, image.naturalHeight, spec);
  layer.width = size.width;
  layer.height = size.height;
  const context = layer.getContext('2d');
  if (!context) return layer;
  const transform = computeRotationTransform(image.naturalWidth, image.naturalHeight, spec, layer.width, layer.height);
  context.imageSmoothingEnabled = false;
  context.translate(transform.translateX, transform.translateY);
  // Canvas composes transforms in reverse order: display-space flips follow rotation.
  context.scale(transform.scaleX, transform.scaleY);
  context.rotate(transform.angleRad);
  context.drawImage(image, -transform.drawWidth / 2, -transform.drawHeight / 2, transform.drawWidth, transform.drawHeight);
  return layer;
}
