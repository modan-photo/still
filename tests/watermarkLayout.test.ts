import { describe, expect, it } from 'vitest';
import { watermarkTextLayout } from '../src/render/watermark';
import { DEFAULT_WATERMARK } from '../src/types/renderSpec';

describe('watermark source-pixel layout', () => {
  it('keeps px size independent of crop and border-expanded canvas dimensions', () => {
    const spec = structuredClone(DEFAULT_WATERMARK);
    spec.font!.size = 32;
    expect(watermarkTextLayout(spec, 6000, 0.25).size).toBe(8);
    expect(watermarkTextLayout(spec, 4000, 0.25).size).toBe(8);
  });

  it('uses original source long edge for percentage fonts after a crop', () => {
    const spec = structuredClone(DEFAULT_WATERMARK);
    spec.font!.sizeUnit = 'percent';
    spec.font!.size = 2;
    spec.scale = 0.5;
    expect(watermarkTextLayout(spec, 6000, 0.25).size).toBe(15);
  });

  it('rounds source padding before scaling and preserves fractional line height', () => {
    const spec = structuredClone(DEFAULT_WATERMARK);
    spec.font!.size = 12;
    spec.font!.strokeWidth = 0.5;
    spec.font!.shadow = { color: '#000000', blur: 0.2, offsetX: 0.1, offsetY: 0 };
    const layout = watermarkTextLayout(spec, 128, 0.5);
    expect(layout.padding).toBe(2.5);
    expect(layout.lineHeight).toBeCloseTo(7.68);
  });
});
