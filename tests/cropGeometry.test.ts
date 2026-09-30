import { describe, expect, it } from 'vitest';
import { cropForAspect } from '../src/render/crop';
import { moveCropRect, resizeCropRect, type CropHandle } from '../src/render/cropGeometry';
import type { CropRect } from '../src/types/renderSpec';

const handles: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const initial = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
const center = (rect: CropRect) => [rect.x + rect.width / 2, rect.y + rect.height / 2];

function expectBounded(rect: CropRect) {
  expect(rect.x).toBeGreaterThanOrEqual(-1e-12);
  expect(rect.y).toBeGreaterThanOrEqual(-1e-12);
  expect(rect.x + rect.width).toBeLessThanOrEqual(1 + 1e-12);
  expect(rect.y + rect.height).toBeLessThanOrEqual(1 + 1e-12);
  expect(rect.width).toBeGreaterThanOrEqual(0.1 - 1e-12);
  expect(rect.height).toBeGreaterThanOrEqual(0.1 - 1e-12);
}

describe('crop movement', () => {
  it('moves without changing size and clamps on every boundary', () => {
    const moved = moveCropRect(initial, 0.1, -0.2);
    expect(moved.x).toBeCloseTo(0.35, 12);
    expect(moved.y).toBeCloseTo(0.05, 12);
    expect(moved.width).toBe(0.5);
    expect(moved.height).toBe(0.5);
    expect(moveCropRect(initial, 2, -2)).toEqual({ ...initial, x: 0.5, y: 0 });
    expect(moveCropRect(initial, -2, 2)).toEqual({ ...initial, x: 0, y: 0.5 });
    expect(initial).toEqual({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
  });
});

describe('free resizing', () => {
  it('preserves the untouched dimension exactly and ignores a stationary pointer', () => {
    const rect = { x: 0.35, y: 0.3, width: 0.375, height: 0.375 };
    expect(resizeCropRect(rect, 'e', 0.1, 0, 'free', 1000, 1000).height).toBe(rect.height);
    expect(resizeCropRect(rect, 'se', 0, 0, '1:1', 1000, 1000)).toEqual(rect);
  });
  it.each(handles)('keeps bounds, minimum size and opposite edges with %s', handle => {
    for (const dx of [-2, -0.03, 0, 0.03, 2]) for (const dy of [-2, -0.03, 0, 0.03, 2]) {
      const result = resizeCropRect(initial, handle, dx, dy, 'free', 4000, 3000);
      expectBounded(result);
      if (handle.includes('w')) expect(result.x + result.width).toBeCloseTo(0.75, 12);
      else expect(result.x).toBe(0.25);
      if (handle.includes('n')) expect(result.y + result.height).toBeCloseTo(0.75, 12);
      else expect(result.y).toBe(0.25);
      if (!handle.includes('e') && !handle.includes('w')) expect(result.width).toBe(0.5);
      if (!handle.includes('n') && !handle.includes('s')) expect(result.height).toBe(0.5);
    }
  });
});

describe('fixed-ratio resizing', () => {
  it.each(handles)('holds ratio and opposite anchor for %s across both orientations', handle => {
    for (const aspect of ['1:1', '4:3', '3:2', '16:9', '2:3', '3:4', '9:16'] as const) {
      for (const [sourceWidth, sourceHeight] of [[4000, 3000], [3000, 4000]]) {
        const start = cropForAspect(aspect, sourceWidth, sourceHeight).rect;
        const [numerator, denominator] = aspect.split(':').map(Number);
        for (const dx of [-2, -0.03, 0, 0.03, 2]) for (const dy of [-2, -0.03, 0, 0.03, 2]) {
          const result = resizeCropRect(start, handle, dx, dy, aspect, sourceWidth, sourceHeight);
          expectBounded(result);
          expect(result.width * sourceWidth / (result.height * sourceHeight)).toBeCloseTo(numerator / denominator, 10);
          if (handle.includes('w')) expect(result.x + result.width).toBeCloseTo(start.x + start.width, 12);
          else if (handle.includes('e')) expect(result.x).toBeCloseTo(start.x, 12);
          else expect(center(result)[0]).toBeCloseTo(center(start)[0], 12);
          if (handle.includes('n')) expect(result.y + result.height).toBeCloseTo(start.y + start.height, 12);
          else if (handle.includes('s')) expect(result.y).toBeCloseTo(start.y, 12);
          else expect(center(result)[1]).toBeCloseTo(center(start)[1], 12);
        }
      }
    }
  });

  it('expands an east edge around the west midpoint', () => {
    expect(resizeCropRect(initial, 'e', 0.1, 0.3, '1:1', 1000, 1000))
      .toEqual({ x: 0.25, y: 0.2, width: 0.6, height: 0.6 });
  });
});
