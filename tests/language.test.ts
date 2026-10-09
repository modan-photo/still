import { describe, expect, it } from 'vitest';
import { translate } from '../src/i18n/messages';

describe('language messages', () => {
  it('translates the settings and primary navigation without changing their keys', () => {
    expect(translate('zh', 'settingsTitle')).toBe('应用设置');
    expect(translate('zh', 'importPhotos')).toBe('导入照片');
    expect(translate('zh', 'frame')).toBe('边框');
    expect(translate('en', 'frame')).toBe('Frame');
  });
});
