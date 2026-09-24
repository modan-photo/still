import { useEffect, useState } from 'react';
import { cacheAssetUrl, getCachedImage, normalizeError, type AppError } from '../services/tauri/image';

interface PreviewState { path: string | null; image: HTMLImageElement | null; loading: boolean; error: AppError | null }
/** Holds decoded pixels locally; the store only holds paths and metadata. */
export function useImagePreview(path: string | null) {
  const [state, setState] = useState<PreviewState>({ path: null, image: null, loading: false, error: null });
  useEffect(() => {
    let disposed = false;
    let image: HTMLImageElement | null = null;
    if (!path) { setState({ path, image: null, loading: false, error: null }); return; }
    setState({ path, image: null, loading: true, error: null });
    void (async () => {
      try {
        const cached = await getCachedImage(path, 'preview');
        if (disposed) return;
        image = new Image();
        image.src = cacheAssetUrl(cached.path);
        await image.decode();
        if (!disposed) setState({ path, image, loading: false, error: null });
      } catch (error) {
        if (!disposed) setState({ path, image: null, loading: false, error: normalizeError(error) });
      }
    })();
    return () => {
      disposed = true;
      if (image) { image.removeAttribute('src'); image = null; }
    };
  }, [path]);
  // Hide the previous photo immediately, before effect cleanup runs.
  return state.path === path ? state : { path, image: null, loading: path !== null, error: null };
}
