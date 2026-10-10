import { describe, expect, it } from 'vitest';
import { DEFAULT_WATERMARK } from '../src/types/renderSpec';
import {
  createPresetBundle,
  isFramePreset,
  isWatermarkPreset,
  mergeImportedPresets,
  parsePresetBundle,
  presetBundleErrorKey,
  presetTransferErrorMessage,
} from '../src/services/presetBundles';
import { translate } from '../src/i18n/messages';
import { useUIStore } from '../src/stores/uiStore';

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
    const contents = JSON.stringify({
      version: 1,
      kind: 'watermark',
      defaultPresetId: preset.id,
      presets: [preset, preset],
    });
    expect(() => parsePresetBundle(contents, 'watermark', isWatermarkPreset)).toThrow('unique');
    expect(() =>
      parsePresetBundle(
        JSON.stringify({
          version: 1,
          kind: 'watermark',
          defaultPresetId: 'missing',
          presets: [preset],
        }),
        'watermark',
        isWatermarkPreset,
      ),
    ).toThrow('default');
  });

  it('exports only a default that exists in the bundle and rejects duplicate IDs', () => {
    const contents = createPresetBundle('watermark', [preset], 'stale-default');
    expect(parsePresetBundle(contents, 'watermark', isWatermarkPreset).defaultPresetId).toBeNull();
    expect(() => createPresetBundle('watermark', [preset, preset], preset.id)).toThrow('unique');
    expect(() => createPresetBundle('watermark', [{ ...preset, id: '' }], null)).toThrow(
      'nonempty',
    );
  });

  it('rejects more than 500 presets before writing or importing a bundle', () => {
    const many = Array.from({ length: 501 }, (_, index) => ({ ...preset, id: `preset-${index}` }));
    expect(() => createPresetBundle('watermark', many, null)).toThrow('500');
    const contents = JSON.stringify({
      version: 1,
      kind: 'watermark',
      defaultPresetId: null,
      presets: many,
    });
    expect(() => parsePresetBundle(contents, 'watermark', isWatermarkPreset)).toThrow('500');
  });

  it('rejects malformed gradient and shadow frame parameters before saving', () => {
    const frame = {
      id: 'user-gradient',
      name: 'Gradient',
      style: 'gradient',
      builtin: false,
      createdAt: 1,
      params: {
        width: 20,
        unit: 'px',
        color: '#ffffff',
        radius: 0,
        gradient: { angle: 45, stops: [{ offset: 0, color: '#ffffff' }] },
        shadow: { spread: 1, blur: 2, offsetY: 3, color: '#000000' },
      },
    };
    expect(isFramePreset(frame)).toBe(true);
    expect(
      parsePresetBundle(createPresetBundle('frame', [frame], frame.id), 'frame', isFramePreset)
        .defaultPresetId,
    ).toBe(frame.id);
    const invalid = [
      {
        ...frame,
        params: {
          ...frame.params,
          gradient: { angle: 45, stops: [{ offset: 'bad', color: '#ffffff' }] },
        },
      },
      {
        ...frame,
        params: {
          ...frame.params,
          shadow: { spread: 1, blur: Number.NaN, offsetY: 3, color: '#000000' },
        },
      },
    ];
    for (const item of invalid) {
      const contents = JSON.stringify({
        version: 1,
        kind: 'frame',
        defaultPresetId: null,
        presets: [item],
      });
      expect(() => parsePresetBundle(contents, 'frame', isFramePreset)).toThrow('valid frame');
    }
  });

  it('returns stable, translatable errors for invalid preset files', () => {
    const cases = [
      { contents: '{', kind: 'watermark' as const, key: 'presetFileInvalidJson' },
      { contents: '{}', kind: 'frame' as const, key: 'framePresetFileInvalid' },
      {
        contents: JSON.stringify({
          version: 1,
          kind: 'watermark',
          defaultPresetId: preset.id,
          presets: [preset, preset],
        }),
        kind: 'watermark' as const,
        key: 'presetFileInvalidIds',
      },
      {
        contents: ' '.repeat(2 * 1024 * 1024 + 1),
        kind: 'frame' as const,
        key: 'presetFileTooLarge',
      },
    ] as const;
    for (const { contents, kind, key } of cases) {
      try {
        parsePresetBundle(contents, kind, isWatermarkPreset);
        throw new Error('Expected invalid preset file to fail');
      } catch (error) {
        expect(presetBundleErrorKey(error)).toBe(key);
        expect(translate('zh', key)).not.toBe(translate('en', key));
      }
    }
    expect(presetBundleErrorKey(new Error('disk failure'))).toBeNull();
    expect(
      presetBundleErrorKey({
        code: 'invalid_input',
        message: 'invalid input: preset bundle exceeds 2 MiB',
      }),
    ).toBe('presetFileTooLarge');
    expect(
      presetBundleErrorKey({
        code: 'invalid_input',
        message: 'invalid input: preset bundle must be UTF-8 JSON',
      }),
    ).toBe('presetFileInvalidEncoding');
    expect(presetBundleErrorKey({ code: 'invalid_input', message: 'another detail' })).toBeNull();
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

  it('rejects malformed optional image watermark font and path fields', () => {
    const image = {
      ...preset,
      watermark: { ...DEFAULT_WATERMARK, type: 'image' as const, path: 'C:/photos/stamp.png' },
    };
    expect(isWatermarkPreset(image)).toBe(true);
    const invalid = [
      {
        ...image,
        watermark: { ...image.watermark, font: { ...DEFAULT_WATERMARK.font, path: 42 } },
      },
      {
        ...image,
        watermark: {
          ...image.watermark,
          font: {
            ...DEFAULT_WATERMARK.font,
            shadow: { color: '#000', blur: 'bad', offsetX: 0, offsetY: 0 },
          },
        },
      },
      { ...preset, watermark: { ...DEFAULT_WATERMARK, path: 42 } },
    ];
    for (const item of invalid) {
      const contents = JSON.stringify({
        version: 1,
        kind: 'watermark',
        defaultPresetId: null,
        presets: [item],
      });
      expect(() => parsePresetBundle(contents, 'watermark', isWatermarkPreset)).toThrow(
        'valid watermark',
      );
    }
  });

  it('shows localized native errors and retains recovery details', () => {
    const previous = useUIStore.getState().language;
    try {
      useUIStore.getState().setLanguage('zh');
      expect(
        presetTransferErrorMessage(
          { code: 'invalid_input', message: 'invalid input: preset bundle exceeds 2 MiB' },
          'presetsImportFailed',
        ),
      ).toBe(translate('zh', 'presetFileTooLarge'));
      expect(
        presetTransferErrorMessage(
          {
            code: 'document_cleanup_required',
            message: 'Remove content://provider/failed manually',
          },
          'presetsExportFailed',
        ),
      ).toContain('content://provider/failed');
      expect(
        presetTransferErrorMessage(
          { code: 'invalid_input', message: 'invalid input: preset path must end in .json' },
          'presetsImportFailed',
        ),
      ).toContain('preset path must end in .json');
      expect(presetTransferErrorMessage(null, 'presetsImportFailed')).toBe(
        translate('zh', 'presetsImportFailed'),
      );
      useUIStore.getState().setLanguage('en');
      expect(
        presetTransferErrorMessage(
          { code: 'invalid_input', message: 'invalid input: preset bundle exceeds 2 MiB' },
          'presetsImportFailed',
        ),
      ).toBe(translate('en', 'presetFileTooLarge'));
    } finally {
      useUIStore.getState().setLanguage(previous);
    }
  });
});
