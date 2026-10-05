import { open } from '@tauri-apps/plugin-dialog';
import { AppError, loadImage } from './tauri/image';

/** Register a document URI before any preview or export tries to read it. */
export async function selectWatermarkImage(): Promise<string | null> {
  const path = await open({
    multiple: false,
    filters: [{ name: 'PNG image', extensions: ['png'] }],
  });
  if (typeof path !== 'string') return null;
  const image = await loadImage(path);
  if (image.format !== 'png') {
    throw new AppError('invalid_input', 'Choose a PNG image for the stamp.');
  }
  return path;
}
