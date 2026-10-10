import { invoke, isTauri } from '@tauri-apps/api/core';
import type { FramePreset, FrameStyle } from '../../types/frame';

interface FramePresetFile {
  version: 1;
  presets: FramePreset[];
}

const BROWSER_STORAGE_KEY = 'still.frame-presets';
const BROWSER_BACKUP_STORAGE_KEY = `${BROWSER_STORAGE_KEY}.bak`;
const EMPTY_PRESET_FILE: FramePresetFile = { version: 1, presets: [] };
const FRAME_STYLES: readonly FrameStyle[] = ['solid', 'gradient', 'shadow', 'polaroid'];

export async function loadFramePresets(
  onRecovered?: (backupKey: string) => void,
): Promise<FramePreset[]> {
  const value: unknown = isTauri()
    ? await invoke<unknown>('frame_presets_load')
    : readBrowserPresetFile(onRecovered);
  return normalizePresetFile(value).presets;
}

export async function saveFramePresets(
  presets: readonly FramePreset[],
  onRecovered?: (backupKey: string) => void,
): Promise<void> {
  const file = normalizePresetFile({ version: 1, presets });
  if (file.presets.length !== presets.length || !hasUniqueIds(file.presets)) {
    throw new Error('Only valid user frame presets can be persisted.');
  }
  if (isTauri()) {
    await invoke('frame_presets_save', { file });
    return;
  }
  readBrowserPresetFile(onRecovered);
  localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(file));
}

function readBrowserPresetFile(onRecovered?: (backupKey: string) => void): unknown {
  const stored = localStorage.getItem(BROWSER_STORAGE_KEY);
  if (stored === null) return EMPTY_PRESET_FILE;
  let value: unknown;
  try {
    value = JSON.parse(stored) as unknown;
  } catch {
    const backupKey = backupBrowserPresetFile(stored);
    onRecovered?.(backupKey);
    return EMPTY_PRESET_FILE;
  }
  const normalized = normalizePresetFile(value);
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.presets) ||
    normalized.presets.length !== value.presets.length ||
    !hasUniqueIds(normalized.presets)
  ) {
    const backupKey = backupBrowserPresetFile(stored);
    onRecovered?.(backupKey);
    return EMPTY_PRESET_FILE;
  }
  return value;
}

function backupBrowserPresetFile(contents: string): string {
  let backupKey = BROWSER_BACKUP_STORAGE_KEY;
  for (let suffix = 2; localStorage.getItem(backupKey) !== null; suffix += 1)
    backupKey = `${BROWSER_BACKUP_STORAGE_KEY}.${suffix}`;
  localStorage.setItem(backupKey, contents);
  localStorage.removeItem(BROWSER_STORAGE_KEY);
  return backupKey;
}

function normalizePresetFile(value: unknown): FramePresetFile {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.presets)) {
    return EMPTY_PRESET_FILE;
  }
  return {
    version: 1,
    presets: value.presets.filter(isUserFramePreset).map((preset) => structuredClone(preset)),
  };
}

function hasUniqueIds(presets: readonly FramePreset[]): boolean {
  return new Set(presets.map((preset) => preset.id)).size === presets.length;
}

function isUserFramePreset(value: unknown): value is FramePreset {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.startsWith('user-'))
    return false;
  if (typeof value.name !== 'string' || !value.name.trim() || value.builtin !== false) return false;
  if (!FRAME_STYLES.includes(value.style as FrameStyle) || !Number.isFinite(value.createdAt))
    return false;
  if (!isRecord(value.params)) return false;
  const { width, unit, color, radius, gradient, shadow } = value.params;
  if (!Number.isFinite(width) || (unit !== 'px' && unit !== 'percent')) return false;
  if (typeof color !== 'string' || !Number.isFinite(radius)) return false;
  if (gradient !== undefined && !isGradient(gradient)) return false;
  if (shadow !== undefined && !isShadow(shadow)) return false;
  return true;
}

function isGradient(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isFinite(value.angle) &&
    Array.isArray(value.stops) &&
    value.stops.every(
      (stop) => isRecord(stop) && Number.isFinite(stop.offset) && typeof stop.color === 'string',
    )
  );
}

function isShadow(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isFinite(value.spread) &&
    Number.isFinite(value.blur) &&
    Number.isFinite(value.offsetY) &&
    typeof value.color === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
