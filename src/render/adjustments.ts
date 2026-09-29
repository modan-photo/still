import type { AdjustmentsSpec } from '../types/renderSpec';

export const DEFAULT_ADJUSTMENTS: AdjustmentsSpec = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
};

/** Applies the same exposure/contrast/saturation math as the Rust export path. */
export function applyAdjustmentsToImageData(image: ImageData, spec: AdjustmentsSpec): ImageData {
  const exposure = 2 ** spec.exposure;
  const contrast = 1 + spec.contrast;
  const saturation = 1 + spec.saturation;
  const pixels = image.data;

  for (let index = 0; index < pixels.length; index += 4) {
    let red = pixels[index] * exposure;
    let green = pixels[index + 1] * exposure;
    let blue = pixels[index + 2] * exposure;
    red = (red - 127.5) * contrast + 127.5;
    green = (green - 127.5) * contrast + 127.5;
    blue = (blue - 127.5) * contrast + 127.5;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    pixels[index] = clampByte(luminance + (red - luminance) * saturation);
    pixels[index + 1] = clampByte(luminance + (green - luminance) * saturation);
    pixels[index + 2] = clampByte(luminance + (blue - luminance) * saturation);
  }
  return image;
}

export function renderAdjustedPreview(image: HTMLImageElement, spec: AdjustmentsSpec): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  layer.width = image.naturalWidth;
  layer.height = image.naturalHeight;
  const context = layer.getContext('2d');
  if (!context) return layer;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, layer.width, layer.height);
  context.putImageData(applyAdjustmentsToImageData(pixels, spec), 0, 0);
  return layer;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
