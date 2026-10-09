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
