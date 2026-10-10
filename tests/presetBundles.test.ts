import { describe, expect, it } from 'vitest';
import { DEFAULT_WATERMARK } from '../src/types/renderSpec';
import {
  createPresetBundle,
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

  it('returns stable, translatable errors for invalid preset files', () => {
    const cases = [
      { contents: '{', kind: 'watermark' as const, key: 'presetFileInvalidJson' },
      { contents: '{}', kind: 'frame' as const, key: 'framePresetFileInvalid' },
      {
        contents: createPresetBundle('watermark', [preset, preset], preset.id),
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
