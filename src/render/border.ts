import type { BorderSpec } from '../types/renderSpec';

type BorderGeometry = {
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  borderWidth: number;
  radius: number;
};

const round = (value: number) => Math.max(0, Math.round(value));

export function borderGeometry(
  previewWidth: number,
  previewHeight: number,
  originalWidth: number,
  originalHeight: number,
  cfg: BorderSpec,
): BorderGeometry {
  const previewScale = previewWidth / Math.max(1, originalWidth);
  const unitValue = (value: number) => cfg.unit === 'percent'
    ? round(Math.max(originalWidth, originalHeight) * value / 100 * previewScale)
    : round(value * previewScale);
  const borderWidth = unitValue(cfg.width);
  const radius = round(cfg.radius * previewScale);

  if (cfg.style === 'film') {
    return { width: previewWidth, height: previewHeight + borderWidth * 2, sourceX: 0, sourceY: borderWidth, borderWidth, radius };
  }
  if (cfg.style === 'polaroid') {
    const bottom = round(borderWidth * (cfg.caption ? 3 : 1.6));
    return { width: previewWidth + borderWidth * 2, height: previewHeight + borderWidth + bottom, sourceX: borderWidth, sourceY: borderWidth, borderWidth, radius };
  }
  return { width: previewWidth + borderWidth * 2, height: previewHeight + borderWidth * 2, sourceX: borderWidth, sourceY: borderWidth, borderWidth, radius };
}

/** Renders the downsampled source with the same geometry used by Rust export. */
export function renderBorderPreview(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  cfg: BorderSpec,
  originalWidth: number,
  originalHeight: number,
): void {
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const geometry = borderGeometry(sourceWidth, sourceHeight, originalWidth, originalHeight, cfg);
  canvas.width = geometry.width;
  canvas.height = geometry.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  roundedRect(ctx, 0, 0, geometry.width, geometry.height, geometry.radius);
  ctx.clip();
  if (cfg.style === 'gradient') {
    ctx.fillStyle = createGradient(ctx, geometry.width, geometry.height, cfg.colors, cfg.angle);
  } else if (cfg.style === 'film') {
    ctx.fillStyle = '#0C0C0B';
  } else if (cfg.style === 'polaroid') {
    ctx.fillStyle = '#FAF9F6';
  } else {
    ctx.fillStyle = normalizeColor(cfg.color);
  }
  ctx.fillRect(0, 0, geometry.width, geometry.height);
  ctx.drawImage(image, geometry.sourceX, geometry.sourceY, sourceWidth, sourceHeight);
  if (cfg.style === 'film') drawFilmHoles(ctx, geometry, sourceHeight);
  ctx.restore();
}

function drawFilmHoles(ctx: CanvasRenderingContext2D, geometry: BorderGeometry, sourceHeight: number) {
  const width = geometry.width;
  const border = geometry.borderWidth;
  if (border < 4 || width < 8) return;
  const desiredStep = Math.min(72, Math.max(18, width * 0.065));
  const count = Math.max(2, Math.floor(width / desiredStep));
  const step = width / count;
  const holeWidth = round(Math.max(3, step * 0.46));
  const holeHeight = round(Math.max(2, border * 0.34));
  ctx.fillStyle = '#ECE8DA';
  for (let index = 0; index < count; index += 1) {
    const x = Math.max(0, Math.round((index + 0.5) * step - holeWidth / 2));
    const topY = Math.floor((border - holeHeight) / 2);
    const bottomY = border + sourceHeight + Math.floor((border - holeHeight) / 2);
    ctx.fillRect(x, topY, holeWidth, holeHeight);
    ctx.fillRect(x, bottomY, holeWidth, holeHeight);
  }
}

function createGradient(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: string[],
  angle: number,
) {
  const radians = angle * Math.PI / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  const span = Math.max(1, width * Math.abs(dx) + height * Math.abs(dy));
  const centerX = width / 2;
  const centerY = height / 2;
  const gradient = ctx.createLinearGradient(
    centerX - dx * span / 2,
    centerY - dy * span / 2,
    centerX + dx * span / 2,
    centerY + dy * span / 2,
  );
  const stops = colors.length >= 2 ? colors : ['#FFFFFF', '#000000'];
  stops.forEach((color, index) => gradient.addColorStop(index / (stops.length - 1), normalizeColor(color)));
  return gradient;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

function normalizeColor(color: string) {
  return /^#[\da-f]{6}([\da-f]{2})?$/i.test(color) ? color : '#000000';
}
