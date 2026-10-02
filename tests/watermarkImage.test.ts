import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCachedImage, loadImage } from '../src/services/tauri/image';
import { renderWatermarkPreview } from '../src/render/watermark';
import { DEFAULT_WATERMARK } from '../src/types/renderSpec';

vi.mock('../src/services/tauri/image', () => ({
  getCachedImage: vi.fn(),
  loadImage: vi.fn(),
  cacheAssetUrl: (path: string) => path,
}));

const decode = vi.fn();
const drawImage = vi.fn();
const context = { save: vi.fn(), restore: vi.fn(), drawImage, globalAlpha: 1 };
const canvas = () => ({ width: 1200, height: 800, getContext: () => context });

beforeEach(() => {
  vi.clearAllMocks();
  decode.mockResolvedValue(undefined);
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      naturalWidth = 2048;
      naturalHeight = 1024;
      decode = decode;
    },
  );
  vi.stubGlobal('document', { createElement: canvas });
  vi.mocked(getCachedImage).mockResolvedValue({
    path: 'cache.webp',
    width: 2048,
    height: 1024,
    cacheHit: true,
  });
  vi.mocked(loadImage).mockResolvedValue({
    path: 'mark.png',
    hash: 'abc',
    width: 6000,
    height: 3000,
    format: 'png',
    orientation: 1,
    previewUrl: null,
    thumbUrl: 'thumb.webp',
  });
});
afterEach(() => vi.unstubAllGlobals());

function render(path: string, ratio = 0.25) {
  return renderWatermarkPreview(
    canvas() as unknown as HTMLCanvasElement,
    {
      ...DEFAULT_WATERMARK,
      type: 'image',
      path,
      scale: 0.5,
      position: 'center',
      offsetX: 0,
      offsetY: 0,
    },
    6000,
    ratio,
  );
}

describe('image watermark preview', () => {
  it('sizes a downsampled cache using original dimensions at different preview scales', async () => {
    expect(await render('large.png')).toEqual({ x: 225, y: 213, width: 750, height: 375 });
    expect(await render('large.png', 0.1)).toEqual({ x: 450, y: 325, width: 300, height: 150 });
    expect(getCachedImage).toHaveBeenCalledTimes(1);
    expect(loadImage).toHaveBeenCalledTimes(1);
  });

  it('uses oriented metadata rather than the decoded cache dimensions', async () => {
    vi.mocked(loadImage).mockResolvedValueOnce({
      path: 'portrait.jpg',
      hash: 'def',
      width: 3000,
      height: 6000,
      format: 'jpeg',
      orientation: 6,
      previewUrl: null,
      thumbUrl: 'thumb.webp',
    });
    expect(await render('portrait.jpg')).toEqual({ x: 413, y: 25, width: 375, height: 750 });
  });

  it('retries after an IPC failure', async () => {
    vi.mocked(getCachedImage).mockRejectedValueOnce(new Error('temporary read failure'));
    await expect(render('retry.png')).rejects.toThrow('temporary read failure');
    await expect(render('retry.png')).resolves.toMatchObject({ width: 750, height: 375 });
    expect(getCachedImage).toHaveBeenCalledTimes(2);
  });

  it('retries after browser image decoding fails', async () => {
    decode.mockRejectedValueOnce(new Error('decode failed'));
    await expect(render('decode.png')).rejects.toThrow('decode failed');
    await expect(render('decode.png')).resolves.toMatchObject({ width: 750 });
    expect(decode).toHaveBeenCalledTimes(2);
  });
});
