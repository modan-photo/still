import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import type { WatermarkSpec } from '../../types/renderSpec';

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
export async function listWatermarkPresets(): Promise<WatermarkPreset[]> {
  if (isTauri()) return invoke<WatermarkPreset[]>('watermark_presets_list');
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as WatermarkPreset[];
}
export async function saveWatermarkPreset(preset: WatermarkPreset): Promise<WatermarkPreset[]> {
  if (isTauri()) return invoke<WatermarkPreset[]>('watermark_preset_save', { preset });
  const presets = await listWatermarkPresets();
  const index = presets.findIndex((entry) => entry.id === preset.id);
  if (index >= 0) presets[index] = preset;
  else presets.push(preset);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return presets;
}
export async function deleteWatermarkPreset(id: string): Promise<WatermarkPreset[]> {
  if (isTauri()) return invoke<WatermarkPreset[]>('watermark_preset_delete', { id });
  const presets = (await listWatermarkPresets()).filter((entry) => entry.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return presets;
}

export async function replaceWatermarkPresets(presets: WatermarkPreset[]): Promise<WatermarkPreset[]> {
  if (isTauri()) return invoke<WatermarkPreset[]>('watermark_presets_replace', { presets });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  return presets;
}
