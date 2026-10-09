import { describe, expect, it } from 'vitest';
import { DEFAULT_WATERMARK } from '../src/types/renderSpec';
import {
  createPresetBundle,
  isWatermarkPreset,
  mergeImportedPresets,
  parsePresetBundle,
} from '../src/services/presetBundles';

const preset = { id: 'source', name: 'Travel', watermark: DEFAULT_WATERMARK };

describe('preset JSON transfer', () => {
  it('round-trips a bundle and remaps imported IDs without replacing existing presets', () => {
    const contents = createPresetBundle('watermark', [preset], preset.id);
    const parsed = parsePresetBundle(contents, 'watermark', isWatermarkPreset);
    const merged = mergeImportedPresets(
      [preset],
      parsed.presets,
      parsed.defaultPresetId,
      'watermark',
    );
    expect(merged.presets).toHaveLength(2);
    expect(merged.presets[1].name).toBe('Travel (2)');
    expect(merged.presets[1].id).not.toBe(preset.id);
    expect(merged.importedDefaultId).toBe(merged.presets[1].id);
  });

  it('rejects duplicate IDs and a missing default', () => {
    const contents = createPresetBundle('watermark', [preset, preset], preset.id);
    expect(() => parsePresetBundle(contents, 'watermark', isWatermarkPreset)).toThrow('unique');
    expect(() =>
      parsePresetBundle(
        createPresetBundle('watermark', [preset], 'missing'),
        'watermark',
        isWatermarkPreset,
      ),
    ).toThrow('default');
  });

  it('preserves an image watermark path as a reference', () => {
    const image = {
      ...preset,
      watermark: { ...DEFAULT_WATERMARK, type: 'image' as const, path: 'C:/photos/stamp.png' },
    };
    const parsed = parsePresetBundle(
      createPresetBundle('watermark', [image], null),
      'watermark',
      isWatermarkPreset,
    );
    expect(parsed.presets[0].watermark.path).toBe('C:/photos/stamp.png');
  });
});
