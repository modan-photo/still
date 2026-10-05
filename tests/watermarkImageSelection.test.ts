import { beforeEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-dialog';
import { loadImage } from '../src/services/tauri/image';
import { selectWatermarkImage } from '../src/services/watermarkImageSelection';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../src/services/tauri/image', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/tauri/image')>();
  return { ...original, loadImage: vi.fn() };
});

beforeEach(() => vi.clearAllMocks());

describe('image watermark selection', () => {
  it('registers an opaque Android URI before accepting it', async () => {
    const uri = 'content://documents.test/document/opaque%2Fwatermark';
    vi.mocked(open).mockResolvedValue(uri);
    vi.mocked(loadImage).mockResolvedValue({
      path: uri, hash: 'abc', width: 2, height: 2, format: 'png', orientation: 1,
      previewUrl: null, thumbUrl: 'thumb.webp',
    });
    await expect(selectWatermarkImage()).resolves.toBe(uri);
    expect(loadImage).toHaveBeenCalledWith(uri);
  });

  it('rejects a provider document whose bytes are not PNG', async () => {
    const uri = 'content://documents.test/document/disguised.png';
    vi.mocked(open).mockResolvedValue(uri);
    vi.mocked(loadImage).mockResolvedValue({
      path: uri, hash: 'abc', width: 2, height: 2, format: 'jpeg', orientation: 1,
      previewUrl: null, thumbUrl: 'thumb.webp',
    });
    await expect(selectWatermarkImage()).rejects.toMatchObject({
      code: 'invalid_input', message: 'Choose a PNG image for the stamp.',
    });
  });

  it('does not load a source after picker cancellation', async () => {
    vi.mocked(open).mockResolvedValue(null);
    await expect(selectWatermarkImage()).resolves.toBeNull();
    expect(loadImage).not.toHaveBeenCalled();
  });
});
