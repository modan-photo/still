import { describe, expect, it } from 'vitest';
import { createCollageExportPayload } from '../src/services/collageExport';
import { DEFAULT_COLLAGE_DRAFT, type ProjectPhoto } from '../src/stores/projectStore';
import { DEFAULT_BORDER, DEFAULT_WATERMARK } from '../src/types/renderSpec';

describe('collage edit inheritance', () => {
  it('keeps each source identity and applies border and watermark only to the output', () => {
    const photos = ['first.png', 'second.png'].map((path, index) => ({
      id: String(index),
      path,
      spec: {
        version: 1 as const,
        source: { path, width: 80, height: 40 },
        rotation: { angle: 90 as const, flipH: false, flipV: true },
        crop: {
          aspect: 'free' as const,
          rect: { x: 0, y: 0, width: 0.5, height: 1 },
          enabled: true,
        },
        adjustments: { exposure: 0.5, contrast: 0, saturation: 0 },
        border: DEFAULT_BORDER,
        watermark: DEFAULT_WATERMARK,
      },
    })) as ProjectPhoto[];
    const draft = {
      ...DEFAULT_COLLAGE_DRAFT,
      photoIds: photos.map((photo) => photo.id),
      border: { ...DEFAULT_BORDER, color: '#00FF00' },
      watermark: { ...DEFAULT_WATERMARK, content: 'Collage' },
    };
    const payload = JSON.parse(
      JSON.stringify(createCollageExportPayload(draft, photos, 'output.png', 92)),
    );

    expect(payload.items).toHaveLength(2);
    for (const [index, item] of payload.items.entries()) {
      expect(item.renderSpec.source.path).toBe(photos[index].path);
      expect(item.renderSpec.rotation).toEqual(photos[index].spec.rotation);
      expect(item.renderSpec.crop).toEqual(photos[index].spec.crop);
      expect(item.renderSpec.adjustments).toEqual(photos[index].spec.adjustments);
      expect(item.renderSpec).not.toHaveProperty('border');
      expect(item.renderSpec).not.toHaveProperty('watermark');
    }
    expect(payload.config.border.color).toBe('#00FF00');
    expect(payload.config.watermark.content).toBe('Collage');
  });
});
