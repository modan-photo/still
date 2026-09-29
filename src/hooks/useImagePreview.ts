import { useEffect, useState } from 'react';
import { cacheAssetUrl, getCachedImage, normalizeError, type AppError } from '../services/tauri/image';

interface PreviewState { path: string | null; image: HTMLImageElement | null; loading: boolean; error: AppError | null }

/**
 * Loads a display-sized cached image and decodes it into a browser image object.
 *
 * Decoded pixels stay local to the canvas consumer; project state stores only file
 * paths and metadata. Keeping `path` in the state lets the hook reject stale state
 * synchronously when selection changes before the effect has had time to run.
 */
export function useImagePreview(path: string | null) {
  const [state, setState] = useState<PreviewState>({ path: null, image: null, loading: false, error: null });
  useEffect(() => {
    // Native cache generation and browser decoding are both asynchronous. The flag
    // prevents either stage from publishing after cleanup.
    let disposed = false;
    // Retain the created element so cleanup can release its source reference and
    // allow decoded pixel memory to be reclaimed promptly.
    let image: HTMLImageElement | null = null;
    if (!path) {
      setState({ path, image: null, loading: false, error: null });
      return;
    }
    setState({ path, image: null, loading: true, error: null });
    void (async () => {
      try {
        // Tauri returns a cache path; the asset URL converts it into a source the
        // webview is permitted to load.
        const cached = await getCachedImage(path, 'preview');
        if (disposed) return;
        image = new Image();
        image.src = cacheAssetUrl(cached.path);
        // Wait for pixel decoding so consumers never draw a partially ready image.
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
  // Render executes before effect cleanup after a path change. Keying the returned
  // value hides the previous photo immediately instead of flashing it for one frame.
  return state.path === path ? state : { path, image: null, loading: path !== null, error: null };
}
