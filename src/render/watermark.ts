import { cacheAssetUrl, getCachedImage, loadImage } from '../services/tauri/image';
import type { Anchor, WatermarkSpec } from '../types/renderSpec';

export interface WatermarkBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
const watermarkImageCache = new Map<
  string,
  Promise<{ image: HTMLImageElement; width: number; height: number }>
>();

export async function renderWatermarkPreview(
  canvas: HTMLCanvasElement,
  watermark: WatermarkSpec,
  originalLongEdge: number,
  pixelScale: number,
): Promise<WatermarkBounds | null> {
  if (!watermark.content.trim() && watermark.type === 'text') return null;
  const mark =
    watermark.type === 'text'
      ? renderText(watermark, originalLongEdge, pixelScale)
      : await renderImage(watermark, pixelScale);
  if (!mark) return null;
  const rotated = rotate(mark, watermark.rotation);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.save();
  context.globalAlpha = watermark.opacity;
  if (watermark.tiled) {
    const gap = Math.max(1, Math.trunc(watermark.tileGap)) * pixelScale;
    const stepX = rotated.width + gap;
    const stepY = rotated.height + gap;
    let row = 0;
    for (let y = -rotated.height; y < canvas.height; y += stepY, row += 1) {
      // Match Rust's integer stagger instead of introducing half-pixel blur.
      for (
        let x = -rotated.width - (row % 2 ? Math.floor(stepX / 2) : 0);
        x < canvas.width;
        x += stepX
      )
        context.drawImage(rotated, x, y);
    }
    context.restore();
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }
  const bounds = placement(canvas, rotated, watermark, pixelScale);
  context.drawImage(rotated, bounds.x, bounds.y);
  context.restore();
  return bounds;
}

export function watermarkTextLayout(
  spec: WatermarkSpec,
  originalLongEdge: number,
  pixelScale: number,
) {
  const font = spec.font!;
  const sourceSize = Math.max(
    1,
    (font.sizeUnit === 'percent' ? (originalLongEdge * font.size) / 100 : font.size) * spec.scale,
  );
  const italicOverhang = font.italic ? sourceSize * Math.tan((14 * Math.PI) / 180) : 0;
  return {
    size: sourceSize * pixelScale,
    lineHeight: sourceSize * 1.28 * pixelScale,
    padding:
      Math.ceil(
        font.strokeWidth +
          font.shadow.blur * 2 +
          Math.max(Math.abs(font.shadow.offsetX), Math.abs(font.shadow.offsetY)) +
          italicOverhang +
          4,
      ) * pixelScale,
  };
}

function renderText(
  spec: WatermarkSpec,
  originalLongEdge: number,
  ratio: number,
): HTMLCanvasElement {
  const font = spec.font!;
  const { size, lineHeight, padding: extra } = watermarkTextLayout(spec, originalLongEdge, ratio);
  const lines = spec.content.split('\n');
  const measure = document.createElement('canvas').getContext('2d')!;
  const style = font.italic ? 'italic ' : '';
  measure.font = `${style}${font.weight} ${size}px "${font.family}", "Noto Sans SC", "Noto Sans Arabic", "Noto Sans Devanagari", "Noto Emoji", sans-serif`;
  measure.fontKerning = 'none';
  const width = Math.max(1, ...lines.map((line) => measure.measureText(line).width));
  const layer = document.createElement('canvas');
  layer.width = Math.ceil(width + extra * 2);
  layer.height = Math.ceil(lineHeight * lines.length + extra * 2);
  const context = layer.getContext('2d')!;
  context.font = measure.font;
  context.fontKerning = 'none';
  context.textBaseline = 'alphabetic';
  context.fillStyle = font.color;
  context.strokeStyle = font.strokeColor;
  context.lineWidth = font.strokeWidth * 2 * ratio;
  context.lineJoin = 'round';
  context.shadowColor = font.shadow.color;
  context.shadowBlur = font.shadow.blur * ratio;
  context.shadowOffsetX = font.shadow.offsetX * ratio;
  context.shadowOffsetY = font.shadow.offsetY * ratio;
  lines.forEach((line, index) => {
    const y = extra + size + index * lineHeight;
    if (font.strokeWidth > 0) context.strokeText(line, extra, y);
    context.fillText(line, extra, y);
  });
  return layer;
}

async function renderImage(spec: WatermarkSpec, ratio: number): Promise<HTMLCanvasElement | null> {
  if (!spec.path) return null;
  let request = watermarkImageCache.get(spec.path);
  if (!request) {
    const path = spec.path;
    request = loadImage(path)
      .then(async (source) => {
        // Android content URIs need a private snapshot before cache lookup.
        const cached = await getCachedImage(path, 'preview');
        const image = new Image();
        image.src = cacheAssetUrl(cached.path);
        await image.decode();
        return { image, width: source.width, height: source.height };
      })
      .catch((error: unknown) => {
        watermarkImageCache.delete(path);
        throw error;
      });
    watermarkImageCache.set(path, request);
  }
  const { image, width, height } = await request;
  const layer = document.createElement('canvas');
  // Cached pixels are bounded; layout uses the oriented source dimensions.
  layer.width = Math.max(1, Math.round(Math.max(1, Math.round(width * spec.scale)) * ratio));
  layer.height = Math.max(1, Math.round(Math.max(1, Math.round(height * spec.scale)) * ratio));
  layer.getContext('2d')?.drawImage(image, 0, 0, layer.width, layer.height);
  return layer;
}

export function watermarkRotationSize(width: number, height: number, degrees: number) {
  const angle = ((degrees % 360) + 360) % 360;
  if (angle === 0 || angle === 180) return { width, height };
  if (angle === 90 || angle === 270) return { width: height, height: width };
  const radians = (angle * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  return {
    width: Math.ceil(width * cos + height * sin),
    height: Math.ceil(width * sin + height * cos),
  };
}

function rotate(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  const angle = ((degrees % 360) + 360) % 360;
  if (!angle) return source;
  const radians = (angle * Math.PI) / 180;
  const size = watermarkRotationSize(source.width, source.height, angle);
  const layer = document.createElement('canvas');
  layer.width = size.width;
  layer.height = size.height;
  const context = layer.getContext('2d')!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.translate(layer.width / 2, layer.height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return layer;
}

// Rust f32::round rounds ties away from zero; Math.round rounds toward +infinity.
function roundCoordinate(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function placement(
  canvas: HTMLCanvasElement,
  mark: HTMLCanvasElement,
  spec: WatermarkSpec,
  ratio: number,
): WatermarkBounds {
  if (spec.freePosition)
    return {
      x: roundCoordinate(
        spec.freePosition.x * canvas.width - mark.width / 2 + spec.offsetX * ratio,
      ),
      y: roundCoordinate(
        spec.freePosition.y * canvas.height - mark.height / 2 + spec.offsetY * ratio,
      ),
      width: mark.width,
      height: mark.height,
    };
  const [column, row] = anchorIndex(spec.position);
  const x =
    column === 0
      ? spec.offsetX * ratio
      : column === 1
        ? (canvas.width - mark.width) / 2 + spec.offsetX * ratio
        : canvas.width - mark.width - spec.offsetX * ratio;
  const y =
    row === 0
      ? spec.offsetY * ratio
      : row === 1
        ? (canvas.height - mark.height) / 2 + spec.offsetY * ratio
        : canvas.height - mark.height - spec.offsetY * ratio;
  return { x: roundCoordinate(x), y: roundCoordinate(y), width: mark.width, height: mark.height };
}

export function anchorIndex(anchor: Anchor): [number, number] {
  const anchors: Anchor[] = [
    'topLeft',
    'topCenter',
    'topRight',
    'centerLeft',
    'center',
    'centerRight',
    'bottomLeft',
    'bottomCenter',
    'bottomRight',
  ];
  const index = anchors.indexOf(anchor);
  return [index % 3, Math.floor(index / 3)];
}
