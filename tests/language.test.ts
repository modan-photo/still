import { describe, expect, it } from 'vitest';
import { translate } from '../src/i18n/messages';
import { errorMessage } from '../src/services/errorMessages';
import { useUIStore } from '../src/stores/uiStore';
import { formatExifText } from '../src/components/exif/ExifPanel';
import type { ExifData } from '../src/types/exif';

describe('language messages', () => {
  it('translates the settings and primary navigation without changing their keys', () => {
    expect(translate('zh', 'settingsTitle')).toBe('应用设置');
    expect(translate('zh', 'importPhotos')).toBe('导入照片');
    expect(translate('zh', 'frame')).toBe('边框');
    expect(translate('en', 'frame')).toBe('Frame');
  });

  it('interpolates export and EXIF counts in both languages', () => {
    expect(translate('en', 'photoCount', { count: 2 })).toBe('2 photos');
    expect(translate('zh', 'photoCount', { count: 2 })).toBe('2 张照片');
    expect(translate('zh', 'exifBatchSaved', { count: 3 })).toBe('已向 3 个源文件写入 EXIF。');
    expect(translate('zh', 'templateTokens')).toContain('{name}');
  });

  it('translates grid actions and preset feedback with names and counts', () => {
    expect(translate('zh', 'selectedPhotosCount', { count: 3 })).toBe('已选择 3 张');
    expect(translate('zh', 'frameApplyAllHint', { count: 3 })).toContain('3 张照片');
    expect(translate('zh', 'stampDefaultSet', { name: '旅行' })).toContain('旅行');
    expect(translate('en', 'builtInWhiteBorder')).toBe('White Border');
    expect(translate('zh', 'builtInWhiteBorder')).toBe('白色边框');
  });

  it('translates import and transform status without changing technical details', () => {
    expect(
      translate('zh', 'importFailedMany', { count: 2, detail: 'image.jpg: decode failed' }),
    ).toBe('2 张照片导入失败。image.jpg: decode failed');
    expect(translate('en', 'transformBatchCountOne')).toBe('This will apply to 1 photo.');
    expect(translate('zh', 'removedPhotos', { count: 2 })).toBe('已移除 2 张照片');
  });

  it('provides localized keyboard guidance for crop and gradient controls', () => {
    expect(translate('zh', 'cropKeyboardHelp')).toContain('方向键');
    expect(translate('zh', 'gradientStopKeyboardHelp')).toContain('Alt');
    expect(translate('zh', 'backToEditor')).toBe('返回编辑器');
  });

  it('uses the selected language for stable error codes and preserves unknown details', () => {
    const previous = useUIStore.getState().language;
    try {
      useUIStore.getState().setLanguage('zh');
      expect(errorMessage({ code: 'file_read_only', message: 'technical path' })).toContain('只读');
      expect(errorMessage({ code: 'unknown', message: 'technical path' })).toBe('technical path');
      useUIStore.getState().setLanguage('en');
      expect(errorMessage({ code: 'file_read_only', message: 'technical path' })).toContain(
        'read-only',
      );
    } finally {
      useUIStore.getState().setLanguage(previous);
    }
  });

  it('copies EXIF field names in the selected language without changing data', () => {
    const data: ExifData = {
      camera: { make: 'Camera Co', model: null, lens: null, serial: null },
      exposure: {
        focalLength: null,
        aperture: null,
        shutterSpeed: null,
        iso: null,
        exposureBias: null,
      },
      time: { datetimeOriginal: null, datetimeModified: null },
      image: { width: 100, height: 50, orientation: null, colorSpace: null, dpi: null },
      location: null,
      other: { software: null, artist: 'Alice', copyright: null, keywords: null },
    };
    expect(formatExifText(data, 'en')).toContain('Artist: Alice');
    expect(formatExifText(data, 'zh')).toContain('作者: Alice');
    expect(formatExifText(data, 'zh')).toContain('厂商: Camera Co');
  });
});
