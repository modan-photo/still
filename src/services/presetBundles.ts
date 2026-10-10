import { invoke, isTauri } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { platform } from '@tauri-apps/plugin-os';
import type { FramePreset } from '../types/frame';
import type { WatermarkPreset } from './tauri/watermark';
import { translate, type MessageKey } from '../i18n/messages';
import { useUIStore } from '../stores/uiStore';
import { errorMessage } from './errorMessages';

const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
export type PresetKind = 'frame' | 'watermark';
export class PresetBundleError extends Error {
  constructor(
    readonly key: MessageKey,
    message: string,
  ) {
    super(message);
    this.name = 'PresetBundleError';
  }
}

export function presetBundleErrorKey(error: unknown): MessageKey | null {
  if (error instanceof PresetBundleError) return error.key;
  if (isRecord(error) && error.code === 'invalid_input') {
    if (error.message === 'invalid input: preset bundle exceeds 2 MiB') return 'presetFileTooLarge';
    if (error.message === 'invalid input: preset bundle must be UTF-8 JSON')
      return 'presetFileInvalidEncoding';
  }
  return null;
}

export function presetTransferErrorMessage(error: unknown, fallback: MessageKey): string {
  const key = presetBundleErrorKey(error);
  if (key) return translate(useUIStore.getState().language, key);
  if (isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string')
    return errorMessage({ code: error.code, message: error.message });
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return translate(useUIStore.getState().language, fallback);
}

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
  const ids = presets.map((preset) => preset.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== 'string' || !id.trim()))
    throw new PresetBundleError('presetFileInvalidIds', 'Preset IDs must be unique and nonempty.');
  return JSON.stringify(
    {
      version: 1,
      kind,
      defaultPresetId: defaultPresetId && ids.includes(defaultPresetId) ? defaultPresetId : null,
      presets,
    },
    null,
    2,
  );
}

export function parsePresetBundle<T extends { id: string }>(
  contents: string,
  kind: PresetKind,
  valid: (value: unknown) => value is T,
): PresetBundle<T> {
  if (new TextEncoder().encode(contents).length > MAX_BUNDLE_BYTES)
    throw new PresetBundleError('presetFileTooLarge', 'Preset file exceeds 2 MiB.');
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new PresetBundleError('presetFileInvalidJson', 'Preset file is not valid JSON.');
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.kind !== kind ||
    !Array.isArray(value.presets) ||
    value.presets.length > 500 ||
    !value.presets.every(valid) ||
    (value.defaultPresetId !== null && typeof value.defaultPresetId !== 'string')
  ) {
    throw new PresetBundleError(
      kind === 'frame' ? 'framePresetFileInvalid' : 'stampPresetFileInvalid',
      `This is not a valid ${kind} preset file.`,
    );
  }
  const ids = value.presets.map((preset: T) => preset.id);
  if (
    ids.some((id) => !id.trim()) ||
    new Set(ids).size !== ids.length ||
    (value.defaultPresetId !== null && !ids.includes(value.defaultPresetId))
  ) {
    throw new PresetBundleError(
      'presetFileInvalidIds',
      'Preset IDs must be nonempty and unique, and the default must exist in this file.',
    );
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
    if (!name) throw new PresetBundleError('presetNameEmpty', 'Preset names cannot be empty.');
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
    let path: string | null;
    try {
      path = await open({
        multiple: false,
        title: translate(
          useUIStore.getState().language,
          kind === 'frame' ? 'importFramePresetsTitle' : 'importStampPresetsTitle',
        ),
        filters: [
          {
            name: translate(useUIStore.getState().language, 'presetFileFilter'),
            extensions: ['json'],
          },
        ],
      });
    } catch (error) {
      if (platform() === 'android' && isAndroidPickerCancelled(error)) return null;
      throw error;
    }
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
        reject(new PresetBundleError('presetFileTooLarge', 'Preset file exceeds 2 MiB.'));
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
    throw new PresetBundleError('presetFileTooLarge', 'Preset file exceeds 2 MiB.');
  const filename = `still-${kind}-presets.json`;
  if (isTauri()) {
    let path: string | null;
    try {
      path = await save({
        defaultPath: filename,
        filters: [
          {
            name: translate(useUIStore.getState().language, 'presetFileFilter'),
            extensions: ['json'],
          },
        ],
      });
    } catch (error) {
      if (platform() === 'android' && isAndroidPickerCancelled(error)) return false;
      throw error;
    }
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

function isAndroidPickerCancelled(error: unknown): boolean {
  return String(error).includes('File picker cancelled');
}

export function isFramePreset(value: unknown): value is FramePreset {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
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
    Number.isFinite(params.radius) &&
    (params.gradient === undefined || isFrameGradient(params.gradient)) &&
    (params.shadow === undefined || isFrameShadow(params.shadow))
  );
}

function isFrameGradient(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isFinite(value.angle) &&
    Array.isArray(value.stops) &&
    value.stops.every(
      (stop: unknown) =>
        isRecord(stop) && Number.isFinite(stop.offset) && typeof stop.color === 'string',
    )
  );
}

function isFrameShadow(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isFinite(value.spread) &&
    Number.isFinite(value.blur) &&
    Number.isFinite(value.offsetY) &&
    typeof value.color === 'string'
  );
}

export function isWatermarkPreset(value: unknown): value is WatermarkPreset {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    !value.id.trim() ||
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
