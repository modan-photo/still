import { cacheAssetUrl, getCachedImage } from '../services/tauri/image';
import type { Anchor, WatermarkSpec } from '../types/renderSpec';

export interface WatermarkBounds { x: number; y: number; width: number; height: number }
const watermarkImageCache = new Map<string, Promise<HTMLImageElement>>();

export async function renderWatermarkPreview(canvas: HTMLCanvasElement, watermark: WatermarkSpec, originalLongEdge: number): Promise<WatermarkBounds | null> {
  if (!watermark.content.trim() && watermark.type === 'text') return null;
  const mark = watermark.type === 'text'
    ? renderText(watermark, canvas, originalLongEdge)
    : await renderImage(watermark, canvas, originalLongEdge);
  if (!mark) return null;
  const rotated = rotate(mark, watermark.rotation);
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.save();
  context.globalAlpha = watermark.opacity;
  if (watermark.tiled) {
    const ratio = Math.max(canvas.width, canvas.height) / originalLongEdge;
    const gap = watermark.tileGap * ratio;
    const stepX = rotated.width + gap;
    const stepY = rotated.height + gap;
    let row = 0;
    for (let y = -rotated.height; y < canvas.height; y += stepY, row += 1) {
      for (let x = -rotated.width - (row % 2 ? stepX / 2 : 0); x < canvas.width; x += stepX) context.drawImage(rotated, x, y);
    }
    context.restore();
    return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  }
  const bounds = placement(canvas, rotated, watermark, originalLongEdge);
  context.drawImage(rotated, bounds.x, bounds.y);
  context.restore();
  return bounds;
}

function renderText(spec: WatermarkSpec, canvas: HTMLCanvasElement, originalLongEdge: number): HTMLCanvasElement {
  const font = spec.font!;
  const ratio = Math.max(canvas.width, canvas.height) / originalLongEdge;
  const size = (font.sizeUnit === 'percent' ? originalLongEdge * font.size / 100 : font.size) * ratio * spec.scale;
  const lines = spec.content.split('\n');
  const measure = document.createElement('canvas').getContext('2d')!;
  const style = font.italic ? 'italic ' : '';
  measure.font = `${style}${font.weight} ${size}px "${font.family}", "Noto Sans SC", "Noto Emoji", sans-serif`;
  const lineHeight = size * 1.28;
  const width = Math.max(1, ...lines.map((line) => measure.measureText(line).width));
  const extra = (font.strokeWidth + font.shadow.blur * 2 + Math.max(Math.abs(font.shadow.offsetX), Math.abs(font.shadow.offsetY)) + 4) * ratio;
  const layer = document.createElement('canvas');
  layer.width = Math.ceil(width + extra * 2);
  layer.height = Math.ceil(lineHeight * lines.length + extra * 2);
  const context = layer.getContext('2d')!;
  context.font = measure.font;
  context.textBaseline = 'top';
  context.fillStyle = font.color;
  context.strokeStyle = font.strokeColor;
  context.lineWidth = font.strokeWidth * 2 * ratio;
  context.lineJoin = 'round';
  context.shadowColor = font.shadow.color;
  context.shadowBlur = font.shadow.blur * ratio;
  context.shadowOffsetX = font.shadow.offsetX * ratio;
  context.shadowOffsetY = font.shadow.offsetY * ratio;
  lines.forEach((line, index) => {
    const y = extra + index * lineHeight;
    if (font.strokeWidth > 0) context.strokeText(line, extra, y);
    context.fillText(line, extra, y);
  });
  return layer;
}

async function renderImage(spec: WatermarkSpec, canvas: HTMLCanvasElement, originalLongEdge: number): Promise<HTMLCanvasElement | null> {
  if (!spec.path) return null;
  let request = watermarkImageCache.get(spec.path);
  if (!request) {
    request = getCachedImage(spec.path, 'preview').then(async (cached) => {
      const image = new Image();
      image.src = cacheAssetUrl(cached.path);
      await image.decode();
      return image;
    });
    watermarkImageCache.set(spec.path, request);
  }
  const image = await request;
  const ratio = Math.max(canvas.width, canvas.height) / originalLongEdge;
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.round(image.naturalWidth * spec.scale * ratio));
  layer.height = Math.max(1, Math.round(image.naturalHeight * spec.scale * ratio));
  layer.getContext('2d')?.drawImage(image, 0, 0, layer.width, layer.height);
  return layer;
}

function rotate(source: HTMLCanvasElement, degrees: number): HTMLCanvasElement {
  if (!degrees) return source;
  const radians = degrees * Math.PI / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const layer = document.createElement('canvas');
  layer.width = Math.ceil(source.width * cos + source.height * sin);
  layer.height = Math.ceil(source.width * sin + source.height * cos);
  const context = layer.getContext('2d')!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.translate(layer.width / 2, layer.height / 2);
  context.rotate(radians);
  context.drawImage(source, -source.width / 2, -source.height / 2);
  return layer;
}

function placement(canvas: HTMLCanvasElement, mark: HTMLCanvasElement, spec: WatermarkSpec, originalLongEdge: number): WatermarkBounds {
  const ratio = Math.max(canvas.width, canvas.height) / originalLongEdge;
  if (spec.freePosition) return {
    x: spec.freePosition.x * canvas.width - mark.width / 2 + spec.offsetX * ratio,
    y: spec.freePosition.y * canvas.height - mark.height / 2 + spec.offsetY * ratio,
    width: mark.width,
    height: mark.height,
  };
  const [column, row] = anchorIndex(spec.position);
  const x = column === 0 ? spec.offsetX * ratio : column === 1 ? (canvas.width - mark.width) / 2 + spec.offsetX * ratio : canvas.width - mark.width - spec.offsetX * ratio;
  const y = row === 0 ? spec.offsetY * ratio : row === 1 ? (canvas.height - mark.height) / 2 + spec.offsetY * ratio : canvas.height - mark.height - spec.offsetY * ratio;
  return { x, y, width: mark.width, height: mark.height };
}

export function anchorIndex(anchor: Anchor): [number, number] {
  const anchors: Anchor[] = ['topLeft', 'topCenter', 'topRight', 'centerLeft', 'center', 'centerRight', 'bottomLeft', 'bottomCenter', 'bottomRight'];
  const index = anchors.indexOf(anchor);
  return [index % 3, Math.floor(index / 3)];
}
