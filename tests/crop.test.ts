import { describe, expect, it, vi } from 'vitest';
import { applyCropToCanvas, cropForAspect, cropPixelRect } from '../src/render/crop';
import { borderGeometry } from '../src/render/border';
import { DEFAULT_CROP, type CropAspect, type CropRect, type CropSpec } from '../src/types/renderSpec';

const crop = (rect: CropRect): CropSpec => ({ aspect: 'free', rect, enabled: true });

describe('aspect selection', () => {
  it('enables a centered maximal square for an old spec without a crop', () => {
    expect(cropForAspect('1:1', 4000, 3000)).toEqual({
      aspect: '1:1', enabled: true, rect: { x: 0.125, y: 0, width: 0.75, height: 1 },
    });
    expect(cropForAspect('1:1', 3000, 4000)).toEqual({
      aspect: '1:1', enabled: true, rect: { x: 0, y: 0.125, width: 1, height: 0.75 },
    });
  });

  it('preserves the existing center and area when switching ratios away from boundaries', () => {
    const current = crop({ x: 0.3, y: 0.3, width: 0.4, height: 0.4 });
    const next = cropForAspect('16:9', 4000, 3000, current);
    expect(next.rect.x + next.rect.width / 2).toBeCloseTo(0.5, 12);
    expect(next.rect.y + next.rect.height / 2).toBeCloseTo(0.5, 12);
    expect(next.rect.width * next.rect.height).toBeCloseTo(0.16, 12);
    expect(next.rect.width * 4000 / (next.rect.height * 3000)).toBeCloseTo(16 / 9, 12);
    expect(current.rect).toEqual({ x: 0.3, y: 0.3, width: 0.4, height: 0.4 });
  });

  it('shrinks uniformly near an edge while keeping the original center', () => {
    const next = cropForAspect('16:9', 4000, 3000, crop({ x: 0.05, y: 0.1, width: 0.2, height: 0.4 }));
    expect(next.rect.x).toBeCloseTo(0, 12);
    expect(next.rect.width).toBeCloseTo(0.3, 12);
    expect(next.rect.height).toBeCloseTo(0.225, 12);
    expect(next.rect.x + next.rect.width / 2).toBeCloseTo(0.15, 12);
    expect(next.rect.y + next.rect.height / 2).toBeCloseTo(0.3, 12);
  });

  it.each(['1:1', '4:3', '3:2', '16:9', '2:3', '3:4', '9:16'] as const)(
    'fits maximal %s crops for portrait and landscape display orientations', (aspect: CropAspect) => {
      for (const [width, height] of [[4000, 3000], [3000, 4000]]) {
        const { rect } = cropForAspect(aspect, width, height);
        const [numerator, denominator] = aspect.split(':').map(Number);
        expect(rect.width * width / (rect.height * height)).toBeCloseTo(numerator / denominator, 12);
        expect(rect.x + rect.width / 2).toBeCloseTo(0.5, 12);
        expect(rect.y + rect.height / 2).toBeCloseTo(0.5, 12);
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(1);
        expect(rect.y + rect.height).toBeLessThanOrEqual(1);
        expect(Math.max(rect.width, rect.height)).toBeCloseTo(1, 12);
      }
    },
  );

  it('switches to free without changing the existing rectangle, or enables the full image', () => {
    const current = cropForAspect('1:1', 4000, 3000);
    const next = cropForAspect('free', 4000, 3000, current);
    expect(next).toEqual({ ...current, aspect: 'free' });
    expect(next.rect).not.toBe(current.rect);
    expect(cropForAspect('free', 4000, 3000)).toEqual({ ...DEFAULT_CROP, enabled: true, aspect: 'free' });
  });

  it('returns an independent disabled full-image spec on original', () => {
    const next = cropForAspect('original', 4000, 3000, cropForAspect('16:9', 4000, 3000));
    expect(next).toEqual(DEFAULT_CROP);
    expect(next.rect).not.toBe(DEFAULT_CROP.rect);
  });

  it('keeps an already selected fixed ratio unchanged', () => {
    const current = cropForAspect('1:1', 4000, 3000);
    expect(cropForAspect('1:1', 4000, 3000, current)).toEqual(current);
  });
});

describe('crop preview and export coordinates', () => {
  it('preserves full image dimensions for old specs and disabled crops', () => {
    expect(cropPixelRect(4000, 3000)).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
    expect(cropPixelRect(4000, 3000, DEFAULT_CROP)).toEqual({ x: 0, y: 0, width: 4000, height: 3000 });
  });

  it('matches the Rust rounding fixture', () => {
    expect(cropPixelRect(10, 8, crop({ x: 0.15, y: 0.1875, width: 0.35, height: 0.4375 })))
      .toEqual({ x: 2, y: 2, width: 4, height: 4 });
  });

  it('clamps overflowing coordinates and retains one boundary pixel', () => {
    expect(cropPixelRect(10, 8, crop({ x: 0.8, y: -0.5, width: 0.9, height: 2 })))
      .toEqual({ x: 8, y: 0, width: 2, height: 8 });
    expect(cropPixelRect(10, 8, crop({ x: 1.5, y: 1, width: -1, height: 0 })))
      .toEqual({ x: 9, y: 7, width: 1, height: 1 });
  });

  it('handles non-finite values and empty sources like Rust', () => {
    const spec = crop({ x: NaN, y: Infinity, width: NaN, height: -Infinity });
    expect(cropPixelRect(10, 8, spec)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(cropPixelRect(0, 0, spec)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('keeps preview coordinates within one original pixel after cache scaling', () => {
    const spec = crop({ x: 0.125, y: 0.1, width: 0.75, height: 0.8 });
    const full = cropPixelRect(4000, 3000, spec);
    const preview = cropPixelRect(2048, 1536, spec);
    for (const field of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(preview[field] / 0.512 - full[field])).toBeLessThanOrEqual(1);
    }
    expect(spec.rect).toEqual({ x: 0.125, y: 0.1, width: 0.75, height: 0.8 });
  });

  it('draws the source region from intrinsic image dimensions into the destination', () => {
    const drawImage = vi.fn();
    const context = { drawImage } as unknown as CanvasRenderingContext2D;
    const image = { naturalWidth: 10, naturalHeight: 8, width: 100, height: 80 } as HTMLImageElement;
    const spec = crop({ x: 0.15, y: 0.1875, width: 0.35, height: 0.4375 });
    applyCropToCanvas(context, image, spec, 4, 4);
    expect(drawImage).toHaveBeenCalledWith(image, 2, 2, 4, 4, 0, 0, 4, 4);

    const bitmap = { width: 10, height: 8 } as ImageBitmap;
    applyCropToCanvas(context, bitmap, spec, 40, 40);
    expect(drawImage).toHaveBeenLastCalledWith(bitmap, 2, 2, 4, 4, 0, 0, 40, 40);
  });

  it('uses the cropped long edge for percentage borders at the original pixel density', () => {
    const spec: CropSpec = { aspect: '1:1', rect: { x: 0.125, y: 0, width: 0.75, height: 1 }, enabled: true };
    const full = cropPixelRect(4000, 3000, spec);
    const preview = cropPixelRect(2048, 1536, spec);
    const frame = {
      style: 'solid' as const, width: 10, unit: 'percent' as const, color: '#FFFFFF',
      radius: 0, colors: ['#FFFFFF'], angle: 0, caption: false,
    };
    const exportGeometry = borderGeometry(full.width, full.height, full.width, full.height, frame);
    expect(exportGeometry.width).toBe(3600);
    const previewGeometry = borderGeometry(preview.width, preview.height, full.width, full.height, frame);
    expect(previewGeometry.borderWidth).toBe(154);
    expect(previewGeometry.width).toBe(1844);
  });
});
