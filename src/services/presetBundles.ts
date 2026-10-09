import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import type { FramePreset } from '../types/frame';
import type { WatermarkPreset } from './tauri/watermark';

const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
export type PresetKind = 'frame' | 'watermark';
export type PresetBundle<T> = {
  version: 1;
  kind: PresetKind;
  defaultPresetId: string | null;
  presets: T[];
};

export function createPresetBundle<T extends { id: string }>(
  kind: PresetKind,
  presets: readonly T[],
  defaultPresetId: string | null,
): string {
  return JSON.stringify({ version: 1, kind, defaultPresetId, presets }, null, 2);
}

export function parsePresetBundle<T extends { id: string }>(
  contents: string,
  kind: PresetKind,
  valid: (value: unknown) => value is T,
): PresetBundle<T> {
  if (new TextEncoder().encode(contents).length > MAX_BUNDLE_BYTES)
    throw new Error('Preset file exceeds 2 MiB.');
  const value: unknown = JSON.parse(contents);
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.kind !== kind ||
    !Array.isArray(value.presets) ||
    value.presets.length > 500 ||
    !value.presets.every(valid) ||
    (value.defaultPresetId !== null && typeof value.defaultPresetId !== 'string')
  ) {
    throw new Error(`This is not a valid ${kind} preset file.`);
  }
  const ids = value.presets.map((preset: T) => preset.id);
  if (
    new Set(ids).size !== ids.length ||
    (value.defaultPresetId && !ids.includes(value.defaultPresetId))
  ) {
    throw new Error('Preset IDs must be unique and the default must exist in this file.');
  }
  return value as PresetBundle<T>;
}

export function mergeImportedPresets<T extends { id: string; name: string }>(
  current: readonly T[],
  imported: readonly T[],
  importedDefaultId: string | null,
  kind: PresetKind,
): { presets: T[]; importedDefaultId: string | null } {
  const names = new Set(current.map((preset) => preset.name.toLocaleLowerCase()));
  let mappedDefault: string | null = null;
  const added = imported.map((preset) => {
    const id = `${kind === 'frame' ? 'user-' : ''}${crypto.randomUUID()}`;
    let name = preset.name.trim();
    if (!name) throw new Error('Preset names cannot be empty.');
    const base = name;
    for (let index = 2; names.has(name.toLocaleLowerCase()); index += 1)
      name = `${base} (${index})`;
    names.add(name.toLocaleLowerCase());
    if (preset.id === importedDefaultId) mappedDefault = id;
    return { ...structuredClone(preset), id, name };
  });
  return { presets: [...current, ...added], importedDefaultId: mappedDefault };
}

export function getDefaultPresetId(kind: PresetKind): string | null {
  try {
    return localStorage.getItem(`still.default-${kind}-preset`);
  } catch {
    return null;
  }
}

export function setDefaultPresetId(kind: PresetKind, id: string | null): void {
  if (id) localStorage.setItem(`still.default-${kind}-preset`, id);
  else localStorage.removeItem(`still.default-${kind}-preset`);
}

export async function importPresetText(kind: PresetKind): Promise<string | null> {
  if (isTauri()) {
    const path = await open({
      multiple: false,
      title: `Import ${kind} presets`,
      filters: [{ name: 'Still presets', extensions: ['json'] }],
    });
    return typeof path === 'string' ? invoke<string>('preset_bundle_read', { path }) : null;
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > MAX_BUNDLE_BYTES) {
        reject(new Error('Preset file exceeds 2 MiB.'));
        return;
      }
      void file.text().then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function exportPresetText(kind: PresetKind, contents: string): Promise<boolean> {
  if (new TextEncoder().encode(contents).length > MAX_BUNDLE_BYTES)
    throw new Error('Preset file exceeds 2 MiB.');
  const filename = `still-${kind}-presets.json`;
  if (isTauri()) {
    const path = await save({
      defaultPath: filename,
      filters: [{ name: 'Still presets', extensions: ['json'] }],
    });
    if (!path) return false;
    await invoke('preset_bundle_write', { path, contents });
    return true;
  }
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

export function isFramePreset(value: unknown): value is FramePreset {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    value.builtin !== false ||
    !['solid', 'gradient', 'shadow', 'polaroid'].includes(String(value.style)) ||
    !Number.isFinite(value.createdAt) ||
    !isRecord(value.params)
  )
    return false;
  const params = value.params;
  return (
    Number.isFinite(params.width) &&
    ['px', 'percent'].includes(String(params.unit)) &&
    typeof params.color === 'string' &&
    Number.isFinite(params.radius)
  );
}

export function isWatermarkPreset(value: unknown): value is WatermarkPreset {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    !value.name.trim() ||
    !isRecord(value.watermark)
  )
    return false;
  const stamp = value.watermark;
  const anchors = [
    'topLeft',
    'topCenter',
    'topRight',
    'centerLeft',
    'center',
    'centerRight',
    'bottomLeft',
    'bottomCenter',
    'bottomRight',
  ];
  if (
    (stamp.type !== 'text' && stamp.type !== 'image') ||
    typeof stamp.content !== 'string' ||
    !anchors.includes(String(stamp.position)) ||
    typeof stamp.tiled !== 'boolean'
  )
    return false;
  for (const [field, min, max] of [
    ['opacity', 0, 1],
    ['rotation', -180, 180],
    ['scale', 0.01, 20],
    ['tileGap', 0, 10000],
    ['offsetX', -100000, 100000],
    ['offsetY', -100000, 100000],
  ] as const) {
    if (typeof stamp[field] !== 'number' || stamp[field] < min || stamp[field] > max) return false;
  }
  if (
    stamp.freePosition !== undefined &&
    (!isRecord(stamp.freePosition) ||
      typeof stamp.freePosition.x !== 'number' ||
      stamp.freePosition.x < 0 ||
      stamp.freePosition.x > 1 ||
      typeof stamp.freePosition.y !== 'number' ||
      stamp.freePosition.y < 0 ||
      stamp.freePosition.y > 1)
  )
    return false;
  if (stamp.type === 'image') return typeof stamp.path === 'string' && Boolean(stamp.path.trim());
  if (!stamp.content.trim() || !isRecord(stamp.font)) return false;
  const font = stamp.font;
  return (
    typeof font.family === 'string' &&
    Boolean(font.family.trim()) &&
    typeof font.size === 'number' &&
    font.size >= 1 &&
    font.size <= 2000 &&
    (font.sizeUnit === 'px' || font.sizeUnit === 'percent') &&
    typeof font.weight === 'number' &&
    font.weight >= 100 &&
    font.weight <= 900 &&
    typeof font.italic === 'boolean' &&
    typeof font.color === 'string' &&
    typeof font.strokeColor === 'string' &&
    typeof font.strokeWidth === 'number' &&
    font.strokeWidth >= 0 &&
    font.strokeWidth <= 100 &&
    isRecord(font.shadow) &&
    typeof font.shadow.color === 'string' &&
    typeof font.shadow.blur === 'number' &&
    typeof font.shadow.offsetX === 'number' &&
    typeof font.shadow.offsetY === 'number' &&
    Math.abs(font.shadow.blur) <= 1000 &&
    Math.abs(font.shadow.offsetX) <= 1000 &&
    Math.abs(font.shadow.offsetY) <= 1000
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
