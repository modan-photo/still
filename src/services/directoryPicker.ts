import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { open } from '@tauri-apps/plugin-dialog';

/** Android's dialog plugin has no folder picker; use the SAF tree picker. */
export async function pickImportDirectory(
  title = 'Import photo folder',
  defaultPath?: string,
): Promise<string | null> {
  if (platform() === 'android') return invoke<string | null>('document_pick_directory');
  const value = await open({ multiple: false, directory: true, title, defaultPath });
  return typeof value === 'string' ? value : null;
}
