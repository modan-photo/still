import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import type { WatermarkSpec } from '../../types/renderSpec';
import { isWatermarkPreset } from '../presetBundles';

export interface FontInfo {
  family: string;
  path: string;
  builtin: boolean;
}
export interface WatermarkPreset {
  id: string;
  name: string;
  watermark: WatermarkSpec;
}

const fontPromises = new Map<boolean, Promise<FontInfo[]>>();

export function listWatermarkFonts(includeSystem = false): Promise<FontInfo[]> {
  let request = fontPromises.get(includeSystem);
  if (!request) {
    request = isTauri()
      ? invoke<FontInfo[]>('watermark_fonts', { includeSystem }).then(async (fonts) => {
          await Promise.all(fonts.filter((font) => font.builtin).map(loadBundledFont));
          return fonts;
        })
      : Promise.resolve([
          { family: 'Noto Sans SC', path: '', builtin: true },
          { family: 'Noto Sans Arabic', path: '', builtin: true },
          { family: 'Noto Sans Devanagari', path: '', builtin: true },
          { family: 'Noto Serif SC', path: '', builtin: true },
          { family: 'Noto Emoji', path: '', builtin: true },
          { family: 'Inter', path: '', builtin: true },
          { family: 'Playfair Display', path: '', builtin: true },
        ]);
    fontPromises.set(includeSystem, request);
  }
  return request;
}

async function loadBundledFont(font: FontInfo): Promise<void> {
  if (document.fonts.check(`12px "${font.family}"`)) return;
  try {
    const face = new FontFace(font.family, `url("${convertFileSrc(font.path)}")`);
    document.fonts.add(await face.load());
  } catch (error) {
    console.warn(`Unable to preload ${font.family}`, error);
  }
}

const STORAGE_KEY = 'still.watermark-presets';
const BACKUP_STORAGE_KEY = `${STORAGE_KEY}.bak`;
export async function listWatermarkPresets(
  onRecovered?: (backupKey: string) => void,
): Promise<WatermarkPreset[]> {
  if (isTauri()) return invoke<WatermarkPreset[]>('watermark_presets_list');
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === null) return [];
  try {
    const value: unknown = JSON.parse(stored);
    const presets = normalizeStoredWatermarkPresets(value);
    if (presets) return presets;
  } catch {
    // Keep the invalid source until a backup has been written.
  }
  let backupKey = BACKUP_STORAGE_KEY;
  for (let suffix = 2; localStorage.getItem(backupKey) !== null; suffix += 1)
    backupKey = `${BACKUP_STORAGE_KEY}.${suffix}`;
  localStorage.setItem(backupKey, stored);
  localStorage.removeItem(STORAGE_KEY);
  onRecovered?.(backupKey);
  return [];
}
export async function saveWatermarkPreset(
  preset: WatermarkPreset,
  onRecovered?: (backupKey: string) => void,
): Promise<WatermarkPreset[]> {
  if (!isWatermarkPreset(preset)) throw new Error('Only valid watermark presets can be persisted.');
  if (isTauri()) return invoke<WatermarkPreset[]>('watermark_preset_save', { preset });
  const presets = await listWatermarkPresets(onRecovered);
  const index = presets.findIndex((entry) => entry.id === preset.id);
  if (index >= 0) presets[index] = preset;
  else presets.push(preset);
  assertValidWatermarkPresetList(presets);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return presets;
}
export async function deleteWatermarkPreset(
  id: string,
  onRecovered?: (backupKey: string) => void,
): Promise<WatermarkPreset[]> {
  if (isTauri()) return invoke<WatermarkPreset[]>('watermark_preset_delete', { id });
  const presets = (await listWatermarkPresets(onRecovered)).filter((entry) => entry.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return presets;
}

export async function replaceWatermarkPresets(
  presets: WatermarkPreset[],
  onRecovered?: (backupKey: string) => void,
): Promise<WatermarkPreset[]> {
  assertValidWatermarkPresetList(presets);
  if (isTauri()) return invoke<WatermarkPreset[]>('watermark_presets_replace', { presets });
  await listWatermarkPresets(onRecovered);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return presets;
}

function assertValidWatermarkPresetList(value: unknown): asserts value is WatermarkPreset[] {
  if (!isValidWatermarkPresetList(value))
    throw new Error('Only valid watermark presets with unique IDs can be persisted.');
}

function isValidWatermarkPresetList(value: unknown): value is WatermarkPreset[] {
  if (!Array.isArray(value) || !value.every(isWatermarkPreset)) return false;
  const ids = value.map((preset) => preset.id);
  return new Set(ids).size === ids.length;
}

function normalizeStoredWatermarkPresets(value: unknown): WatermarkPreset[] | null {
  if (!Array.isArray(value)) return null;
  const presets = value.map(normalizeStoredWatermarkPreset);
  if (presets.some((preset) => preset === null)) return null;
  return isValidWatermarkPresetList(presets) ? presets : null;
}

function normalizeStoredWatermarkPreset(value: unknown): WatermarkPreset | null {
  if (isWatermarkPreset(value)) return value;
  if (!isRecord(value) || !isRecord(value.watermark)) return null;
  const stamp = value.watermark;
  const font = isRecord(stamp.font) ? stamp.font : null;
  const shadow = font && (font.shadow === undefined || isRecord(font.shadow)) ? font.shadow : null;
  const normalized = {
    ...value,
    watermark: {
      ...stamp,
      tiled: stamp.tiled === undefined ? false : stamp.tiled,
      tileGap: stamp.tileGap === undefined ? 96 : stamp.tileGap,
      ...(font && {
        font: {
          ...font,
          sizeUnit: font.sizeUnit === undefined ? 'px' : font.sizeUnit,
          strokeColor: font.strokeColor === undefined ? '#000000' : font.strokeColor,
          strokeWidth: font.strokeWidth === undefined ? 0 : font.strokeWidth,
          ...(shadow !== null && {
            shadow: {
              ...(isRecord(shadow) ? shadow : {}),
              color: isRecord(shadow) && shadow.color !== undefined ? shadow.color : '#00000080',
              blur: isRecord(shadow) && shadow.blur !== undefined ? shadow.blur : 0,
              offsetX: isRecord(shadow) && shadow.offsetX !== undefined ? shadow.offsetX : 0,
              offsetY: isRecord(shadow) && shadow.offsetY !== undefined ? shadow.offsetY : 0,
            },
          }),
        },
      }),
    },
  };
  return isWatermarkPreset(normalized) ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
