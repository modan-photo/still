import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WATERMARK } from '../src/types/renderSpec';
import {
  listWatermarkPresets,
  replaceWatermarkPresets,
  saveWatermarkPreset,
} from '../src/services/tauri/watermark';

const STORAGE_KEY = 'still.watermark-presets';
const BACKUP_KEY = `${STORAGE_KEY}.bak`;
const preset = { id: 'travel', name: 'Travel', watermark: DEFAULT_WATERMARK };

afterEach(() => vi.unstubAllGlobals());

function stubStorage(initial: string, failBackup = false) {
  const values = new Map([[STORAGE_KEY, initial]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failBackup && key === BACKUP_KEY) throw new Error('Storage is full');
      values.set(key, value);
    },
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

describe('browser watermark preset storage', () => {
  it('backs up malformed JSON and lets the user save a new preset', async () => {
    const values = stubStorage('{broken');
    const onRecovered = vi.fn();
    expect(await listWatermarkPresets(onRecovered)).toEqual([]);
    expect(onRecovered).toHaveBeenCalledWith(BACKUP_KEY);
    expect(values.get(BACKUP_KEY)).toBe('{broken');
    expect(values.has(STORAGE_KEY)).toBe(false);
    expect(await saveWatermarkPreset(preset)).toEqual([preset]);
    expect(JSON.parse(values.get(STORAGE_KEY) ?? '')).toEqual([preset]);
  });

  it('also backs up an empty stored value', async () => {
    const values = stubStorage('');
    expect(await listWatermarkPresets()).toEqual([]);
    expect(values.get(BACKUP_KEY)).toBe('');
    expect(values.has(STORAGE_KEY)).toBe(false);
  });

  it('backs up invalid records or duplicate IDs rather than loading partial data', async () => {
    const invalid = JSON.stringify([preset, { ...preset, watermark: { type: 'text' } }]);
    const values = stubStorage(invalid);
    const onRecovered = vi.fn();
    expect(await listWatermarkPresets(onRecovered)).toEqual([]);
    expect(onRecovered).toHaveBeenCalledWith(BACKUP_KEY);
    expect(values.get(BACKUP_KEY)).toBe(invalid);

    values.set(STORAGE_KEY, JSON.stringify([preset, preset]));
    expect(await listWatermarkPresets(onRecovered)).toEqual([]);
    expect(onRecovered).toHaveBeenLastCalledWith(`${BACKUP_KEY}.2`);
    expect(values.get(BACKUP_KEY)).toBe(invalid);
    expect(values.get(`${BACKUP_KEY}.2`)).toBe(JSON.stringify([preset, preset]));
  });

  it('keeps older presets that omit fields with documented defaults', async () => {
    const legacy = {
      ...preset,
      watermark: {
        ...DEFAULT_WATERMARK,
        tiled: undefined,
        tileGap: undefined,
        font: {
          ...DEFAULT_WATERMARK.font,
          sizeUnit: undefined,
          strokeColor: undefined,
          strokeWidth: undefined,
          shadow: undefined,
        },
      },
    };
    const values = stubStorage(JSON.stringify([legacy]));
    const loaded = await listWatermarkPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].watermark.tiled).toBe(false);
    expect(loaded[0].watermark.tileGap).toBe(96);
    expect(loaded[0].watermark.font?.sizeUnit).toBe('px');
    expect(loaded[0].watermark.font?.strokeWidth).toBe(0);
    expect(loaded[0].watermark.font?.shadow.blur).toBe(0);
    expect(values.has(BACKUP_KEY)).toBe(false);
    await saveWatermarkPreset({ ...loaded[0], name: 'Travel updated' });
    expect(JSON.parse(values.get(STORAGE_KEY) ?? '')[0].name).toBe('Travel updated');
  });

  it('preserves the original if backup fails and blocks an unsafe replacement', async () => {
    const original = '{broken';
    const values = stubStorage(original, true);
    const onRecovered = vi.fn();
    await expect(listWatermarkPresets(onRecovered)).rejects.toThrow('Storage is full');
    expect(onRecovered).not.toHaveBeenCalled();
    await expect(replaceWatermarkPresets([preset])).rejects.toThrow('Storage is full');
    expect(values.get(STORAGE_KEY)).toBe(original);
    expect(values.has(BACKUP_KEY)).toBe(false);
  });

  it('rejects invalid or duplicate replacements before writing', async () => {
    const values = stubStorage(JSON.stringify([preset]));
    await expect(replaceWatermarkPresets([preset, preset])).rejects.toThrow('unique IDs');
    await expect(saveWatermarkPreset({ ...preset, name: '' })).rejects.toThrow('valid');
    expect(JSON.parse(values.get(STORAGE_KEY) ?? '')).toEqual([preset]);
  });
});
