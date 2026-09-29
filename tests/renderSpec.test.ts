import { describe, expect, it } from 'vitest';
import { borderGeometry } from '../src/render/border';
import { applyRenderSettings, syncRenderSettings } from '../src/render/spec';
import { applyAdjustmentsToImageData } from '../src/render/adjustments';
import type { RenderSpec } from '../src/types/renderSpec';

const template: RenderSpec = {
  version: 1,
  source: { path: 'template.png', width: 10, height: 10 },
  border: {
    style: 'solid',
    width: 1,
    unit: 'px',
    color: '#FF0000',
    radius: 0,
    colors: ['#FF0000', '#FF0000'],
    angle: 0,
    caption: false,
  },
  output: { format: 'png', quality: 100 },
};

describe('batch RenderSpec application', () => {
  it('serializes copied settings while preserving the target source', () => {
    const target: RenderSpec = {
      version: 1,
      source: { path: 'target.png', width: 20, height: 10 },
    };

    const applied = applyRenderSettings(target, template);
    const serialized = JSON.parse(JSON.stringify(applied)) as RenderSpec;

    expect(serialized.source).toEqual(target.source);
    expect(serialized.border).toEqual(template.border);
    expect(serialized.output).toEqual(template.output);
    expect(serialized).not.toBe(template);
  });

  it('uses the copied border with the same preview geometry semantics', () => {
    const applied = applyRenderSettings({
      version: 1,
      source: { path: 'target.png', width: 10, height: 10 },
    }, template);

    expect(borderGeometry(10, 10, 10, 10, applied.border!)).toEqual({
      width: 12,
      height: 12,
      sourceX: 1,
      sourceY: 1,
      borderWidth: 1,
      radius: 0,
    });
  });
});

describe('module synchronization', () => {
  it('copies only checked modules and clears missing source modules', () => {
    const target: RenderSpec = {
      version: 1,
      source: { path: 'target.png', width: 10, height: 10 },
      border: template.border,
      watermark: {
        type: 'text', content: 'Target', position: 'center', offsetX: 0, offsetY: 0,
        opacity: 1, rotation: 0, scale: 1, tiled: false, tileGap: 96,
      },
      adjustments: { exposure: 0, contrast: 0, saturation: 0 },
    };
    const source: RenderSpec = {
      version: 1,
      source: { path: 'source.png', width: 20, height: 20 },
      adjustments: { exposure: 0.5, contrast: 0.2, saturation: -0.1 },
    };

    const synced = syncRenderSettings(target, source, ['border', 'adjustments']);

    expect(synced.source).toEqual(target.source);
    expect(synced.border).toBeUndefined();
    expect(synced.watermark).toEqual(target.watermark);
    expect(synced.adjustments).toEqual(source.adjustments);
  });

  it('calculates adjustment preview pixels with export-compatible semantics', () => {
    const pixels = { data: new Uint8ClampedArray([64, 64, 64, 200]), width: 1, height: 1 } as ImageData;
    applyAdjustmentsToImageData(pixels, { exposure: 1, contrast: 0, saturation: 0 });
    expect([...pixels.data]).toEqual([128, 128, 128, 200]);
  });
});
