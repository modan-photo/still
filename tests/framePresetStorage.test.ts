import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFramePresets, saveFramePresets } from '../src/services/tauri/framePresets';
import type { FramePreset } from '../src/types/frame';

const STORAGE_KEY = 'still.frame-presets';
const BACKUP_KEY = `${STORAGE_KEY}.bak`;
const preset: FramePreset = {
  id: 'user-travel',
  name: 'Travel',
  style: 'solid',
  params: { width: 20, unit: 'px', color: '#ffffff', radius: 0 },
  builtin: false,
  createdAt: 1,
};

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

describe('browser frame preset storage', () => {
  it('backs up invalid JSON before a new preset is saved', async () => {
    const values = stubStorage('{broken');
    expect(await loadFramePresets()).toEqual([]);
    expect(values.get(BACKUP_KEY)).toBe('{broken');
    await saveFramePresets([preset]);
    expect(JSON.parse(values.get(STORAGE_KEY) ?? '').presets).toEqual([preset]);
  });

  it('backs up an empty value and preserves earlier backups', async () => {
    const values = stubStorage('');
    expect(await loadFramePresets()).toEqual([]);
    expect(values.get(BACKUP_KEY)).toBe('');
    values.set(STORAGE_KEY, '{broken');
    expect(await loadFramePresets()).toEqual([]);
    expect(values.get(BACKUP_KEY)).toBe('');
    expect(values.get(`${BACKUP_KEY}.2`)).toBe('{broken');
  });

  it('retains the original and blocks save if backup fails', async () => {
    const original = '{broken';
    const values = stubStorage(original, true);
    await expect(loadFramePresets()).rejects.toThrow('Storage is full');
    await expect(saveFramePresets([preset])).rejects.toThrow('Storage is full');
    expect(values.get(STORAGE_KEY)).toBe(original);
    expect(values.has(BACKUP_KEY)).toBe(false);
  });

  it('backs up malformed records before replacing them', async () => {
    const original = JSON.stringify({ version: 1, presets: [{ ...preset, name: '' }] });
    const values = stubStorage(original);
    await saveFramePresets([preset]);
    expect(values.get(BACKUP_KEY)).toBe(original);
    expect(JSON.parse(values.get(STORAGE_KEY) ?? '').presets).toEqual([preset]);
  });
});
