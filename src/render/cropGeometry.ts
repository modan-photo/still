import type { CropAspect, CropRect } from '../types/renderSpec';

export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
const MIN_SIZE = 0.1;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function moveCropRect(rect: CropRect, dx: number, dy: number): CropRect {
  return { ...rect, x: clamp(rect.x + dx, 0, 1 - rect.width), y: clamp(rect.y + dy, 0, 1 - rect.height) };
}

/** Pointer deltas and returned rectangles are normalized to the display-oriented source. */
export function resizeCropRect(
  rect: CropRect, handle: CropHandle, dx: number, dy: number,
  aspect: CropAspect, sourceWidth: number, sourceHeight: number,
): CropRect {
  if (dx === 0 && dy === 0) return { ...rect };
  const west = handle.includes('w');
  const east = handle.includes('e');
  const north = handle.includes('n');
  const south = handle.includes('s');
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  if (aspect === 'free') {
    const x = west ? clamp(rect.x + dx, 0, right - Math.min(MIN_SIZE, right)) : rect.x;
    const y = north ? clamp(rect.y + dy, 0, bottom - Math.min(MIN_SIZE, bottom)) : rect.y;
    const endX = east ? clamp(right + dx, rect.x + Math.min(MIN_SIZE, 1 - rect.x), 1) : right;
    const endY = south ? clamp(bottom + dy, rect.y + Math.min(MIN_SIZE, 1 - rect.y), 1) : bottom;
    return {
      x, y,
      width: west || east ? endX - x : rect.width,
      height: north || south ? endY - y : rect.height,
    };
  }

  const [numerator, denominator] = aspect === 'original' ? [sourceWidth, sourceHeight] : aspect.split(':').map(Number);
  const ratio = (numerator / denominator) / (sourceWidth / sourceHeight);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const anchorX = west ? right : rect.x;
  const anchorY = north ? bottom : rect.y;
  const horizontalSpace = west ? anchorX : 1 - anchorX;
  const verticalSpace = north ? anchorY : 1 - anchorY;
  const corner = (west || east) && (north || south);
  let requestedWidth: number;
  let maximumWidth: number;
  if (corner) {
    const proposedWidth = rect.width + (west ? -dx : dx);
    const proposedHeight = rect.height + (north ? -dy : dy);
    // Project onto the ratio-constrained diagonal in source-pixel space, smoothly
    // following both pointer axes without switching between a dominant X and Y.
    requestedWidth = (proposedWidth * sourceWidth ** 2 + proposedHeight * sourceHeight ** 2 / ratio)
      / (sourceWidth ** 2 + sourceHeight ** 2 / ratio ** 2);
    maximumWidth = Math.min(horizontalSpace, verticalSpace * ratio);
  } else if (west || east) {
    requestedWidth = rect.width + (west ? -dx : dx);
    maximumWidth = Math.min(horizontalSpace, 2 * Math.min(centerY, 1 - centerY) * ratio);
  } else {
    requestedWidth = (rect.height + (north ? -dy : dy)) * ratio;
    maximumWidth = Math.min(2 * Math.min(centerX, 1 - centerX), verticalSpace * ratio);
  }
  const minimumWidth = Math.max(MIN_SIZE, MIN_SIZE * ratio);
  // Reject a resize if this fixed anchor cannot accommodate the 10% minimum.
  if (maximumWidth < minimumWidth) return { ...rect };
  const width = clamp(requestedWidth, minimumWidth, maximumWidth);
  const height = width / ratio;
  return {
    x: Math.max(0, corner || west || east ? (west ? anchorX - width : anchorX) : centerX - width / 2),
    y: Math.max(0, corner || north || south ? (north ? anchorY - height : anchorY) : centerY - height / 2),
    width, height,
  };
}
