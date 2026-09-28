import { describe, expect, it } from 'vitest';
import { borderGeometry } from '../src/render/border';
import { applyRenderSettings } from '../src/render/spec';
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
