import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeRotationTransform, flipCropRect, renderRotatedPreview, rotateCropRect, rotatedDimensions } from '../src/render/rotation';
import { renderCroppedPreview } from '../src/render/crop';
import { DEFAULT_ROTATION, type CropRect, type RotationSpec } from '../src/types/renderSpec';

afterEach(() => vi.unstubAllGlobals());

function expectRectClose(actual: CropRect, expected: CropRect) {
  for (const field of ['x', 'y', 'width', 'height'] as const) {
    expect(actual[field]).toBeCloseTo(expected[field], 12);
  }
}

describe('crop rectangle rotation and flips', () => {
  const rect: CropRect = { x: 0.125, y: 0.25, width: 0.5, height: 0.625 };

  it.each([
    [90, { x: 0.125, y: 0.125, width: 0.625, height: 0.5 }],
    [180, { x: 0.375, y: 0.125, width: 0.5, height: 0.625 }],
    [270, { x: 0.25, y: 0.375, width: 0.625, height: 0.5 }],
  ] as const)('moves an off-center crop through %i degrees', (angle, expected) => {
    expect(rotateCropRect(rect, angle)).toEqual(expected);
    expect(rect).toEqual({ x: 0.125, y: 0.25, width: 0.5, height: 0.625 });
  });

  it('turns the specified vertical strip into a horizontal strip', () => {
    expect(rotateCropRect({ x: 0.25, y: 0, width: 0.5, height: 1 }, 90))
      .toEqual({ x: 0, y: 0.25, width: 1, height: 0.5 });
  });

  it('mirrors horizontal and vertical origins without changing dimensions', () => {
    expect(flipCropRect(rect, 'h')).toEqual({ ...rect, x: 0.375 });
    expect(flipCropRect(rect, 'v')).toEqual({ ...rect, y: 0.125 });
    expect(flipCropRect(flipCropRect(rect, 'h'), 'h')).toEqual(rect);
    expect(flipCropRect(flipCropRect(rect, 'v'), 'v')).toEqual(rect);
  });

  it('preserves full-frame and edge-touching crops inside normalized bounds', () => {
    for (const source of [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.7, y: 0.1, width: 0.3, height: 0.9 },
      { x: 0, y: 0, width: 0.3, height: 0.2 },
    ]) {
      for (const angle of [90, 180, 270] as const) {
        const result = rotateCropRect(source, angle);
        expect(result.x).toBeGreaterThanOrEqual(0);
        expect(result.y).toBeGreaterThanOrEqual(0);
        expect(result.x + result.width).toBeLessThanOrEqual(1 + Number.EPSILON);
        expect(result.y + result.height).toBeLessThanOrEqual(1 + Number.EPSILON);
      }
    }
    expect(rotateCropRect({ x: 0.7, y: 0, width: 0.3, height: 1 }, 180).x).toBeCloseTo(0, 12);
  });

  it('matches transformed corner bounds for all four orientations and both flip axes', () => {
    for (const angle of [0, 90, 180, 270] as const) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          let actual = angle === 0 ? { ...rect } : rotateCropRect(rect, angle);
          if (flipH) actual = flipCropRect(actual, 'h');
          if (flipV) actual = flipCropRect(actual, 'v');
          const transform = computeRotationTransform(1, 1, { angle, flipH, flipV }, 1, 1);
          const points = [
            [rect.x, rect.y], [rect.x + rect.width, rect.y],
            [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
          ].map(([x, y]) => {
            const cosine = Math.cos(transform.angleRad);
            const sine = Math.sin(transform.angleRad);
            return {
              x: 0.5 + transform.scaleX * (cosine * (x - 0.5) - sine * (y - 0.5)),
              y: 0.5 + transform.scaleY * (sine * (x - 0.5) + cosine * (y - 0.5)),
            };
          });
          const xs = points.map(point => point.x);
          const ys = points.map(point => point.y);
          expectRectClose(actual, {
            x: Math.min(...xs), y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
          });
        }
      }
    }
  });

  it('restores fractional coordinates after repeated turns and inverse operations', () => {
    const source = { x: 0.1234, y: 0.082, width: 0.752, height: 0.846 };
    let result = { ...source };
    for (let index = 0; index < 10000; index++) result = rotateCropRect(result, 90);
    expectRectClose(result, source);
    expectRectClose(rotateCropRect(rotateCropRect(source, 90), 270), source);
    expectRectClose(rotateCropRect(rotateCropRect(source, 180), 180), source);
    expectRectClose(flipCropRect(flipCropRect(source, 'h'), 'h'), source);
    expectRectClose(flipCropRect(flipCropRect(source, 'v'), 'v'), source);
    expectRectClose(flipCropRect(flipCropRect(source, 'h'), 'v'), rotateCropRect(source, 180));
  });
});

describe('rotation preview geometry', () => {
  it('fits the rotated dimensions into a container and centers the image', () => {
    for (const angle of [0, 90, 180, 270] as const) {
      const spec: RotationSpec = { ...DEFAULT_ROTATION, angle };
      const transform = computeRotationTransform(400, 300, spec, 200, 100);
      const size = rotatedDimensions(400, 300, spec);
      const fit = Math.min(200 / size.width, 100 / size.height);
      expect(transform.drawWidth).toBeCloseTo(400 * fit);
      expect(transform.drawHeight).toBeCloseTo(300 * fit);
      expect(transform.translateX).toBe(100);
      expect(transform.translateY).toBe(50);
      expect(transform.angleRad).toBe(angle * Math.PI / 180);
      expect(Math.max(size.width * fit / 200, size.height * fit / 100)).toBeCloseTo(1);
    }
  });

  it('maps pixel centers exactly for every angle and display-space flip combination', () => {
    for (const angle of [0, 90, 180, 270] as const) {
      for (const flipH of [false, true]) {
        for (const flipV of [false, true]) {
          const spec: RotationSpec = { angle, flipH, flipV };
          const size = rotatedDimensions(3, 2, spec);
          const transform = computeRotationTransform(3, 2, spec, size.width, size.height);
          for (let x = 0; x < 3; x++) {
            for (let y = 0; y < 2; y++) {
              let [expectedX, expectedY] = angle === 90 ? [1 - y, x]
                : angle === 180 ? [2 - x, 1 - y]
                : angle === 270 ? [y, 2 - x] : [x, y];
              if (flipH) expectedX = size.width - 1 - expectedX;
              if (flipV) expectedY = size.height - 1 - expectedY;
              const centeredX = x + 0.5 - 3 / 2;
              const centeredY = y + 0.5 - 2 / 2;
              const cosine = Math.cos(transform.angleRad);
              const sine = Math.sin(transform.angleRad);
              const actualX = transform.translateX + transform.scaleX * (cosine * centeredX - sine * centeredY);
              const actualY = transform.translateY + transform.scaleY * (sine * centeredX + cosine * centeredY);
              expect(actualX).toBeCloseTo(expectedX + 0.5);
              expect(actualY).toBeCloseTo(expectedY + 0.5);
            }
          }
        }
      }
    }
  });

  it('handles empty sources or containers without dividing by zero', () => {
    for (const [width, height, containerWidth, containerHeight] of [[0, 2, 10, 10], [3, 0, 10, 10], [3, 2, 0, 10], [3, 2, 10, 0]]) {
      const result = computeRotationTransform(width, height, DEFAULT_ROTATION, containerWidth, containerHeight);
      expect(result.drawWidth).toBe(0);
      expect(result.drawHeight).toBe(0);
    }
  });
});

describe('rotation canvas integration', () => {
  it('retains the original image for missing or identity rotation', () => {
    const image = { naturalWidth: 80, naturalHeight: 40 } as HTMLImageElement;
    expect(renderRotatedPreview(image)).toBe(image);
    expect(renderRotatedPreview(image, DEFAULT_ROTATION)).toBe(image);
  });

  it('crops the rotated canvas using its swapped intrinsic dimensions', () => {
    const contexts: Array<{ drawImage: ReturnType<typeof vi.fn>; translate: ReturnType<typeof vi.fn>; scale: ReturnType<typeof vi.fn>; rotate: ReturnType<typeof vi.fn>; imageSmoothingEnabled: boolean }> = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const context = { drawImage: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(), imageSmoothingEnabled: true };
        contexts.push(context);
        return { width: 0, height: 0, getContext: () => context };
      },
    });
    const image = { naturalWidth: 80, naturalHeight: 40 } as HTMLImageElement;
    const rotated = renderRotatedPreview(image, { angle: 90, flipH: true, flipV: false });
    expect(rotated.width).toBe(40);
    expect(rotated.height).toBe(80);
    expect(contexts[0].imageSmoothingEnabled).toBe(false);
    expect(contexts[0].translate).toHaveBeenCalledWith(20, 40);
    expect(contexts[0].scale).toHaveBeenCalledWith(-1, 1);
    expect(contexts[0].rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(contexts[0].drawImage).toHaveBeenCalledWith(image, -40, -20, 80, 40);
    const cropped = renderCroppedPreview(rotated, {
      aspect: 'free', enabled: true, rect: { x: 0.25, y: 0, width: 0.5, height: 1 },
    });
    expect([cropped.width, cropped.height]).toEqual([20, 80]);
    expect(contexts[1].drawImage).toHaveBeenCalledWith(rotated, 10, 0, 20, 80, 0, 0, 20, 80);
  });
});
