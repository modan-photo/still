import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import { loadImage, normalizeError } from '../services/tauri/image';
import { useProjectStore } from '../stores/projectStore';

export function useImageImport() {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef(Promise.resolve());
  const alive = useRef(true);
  const importPaths = useCallback((paths: string[]) => {
    queue.current = queue.current.then(async () => {
      const unique = [...new Set(paths)];
      const failures: string[] = [];
      if (alive.current) setError(null);
      // Two concurrent decoders bound memory; commit in file-selection order.
      for (let i = 0; i < unique.length; i += 2) {
        if (!alive.current) break;
        const results = await Promise.allSettled(unique.slice(i, i + 2).map((path) => loadImage(path)));
        if (!alive.current) break;
        useProjectStore.getState().addPhotos(results.flatMap((result) => {
          if (result.status === 'fulfilled') return [result.value];
          if (normalizeError(result.reason).code === 'cancelled') return [];
          failures.push(normalizeError(result.reason).message); return [];
        }));
        if (results.some((result) => result.status === 'rejected' && normalizeError(result.reason).code === 'cancelled')) break;
      }
      if (alive.current && failures.length) setError(`${failures.length} photo(s) could not be imported. ${failures[0]}`);
    }).catch((reason) => { if (alive.current) setError(normalizeError(reason).message); });
  }, []);
  const choosePhotos = useCallback(async () => {
    if (!isTauri()) { setError('Open the desktop app to import local photos.'); return; }
    try {
      const selected = await open({ multiple: true, directory: false, filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'] }] });
      if (selected && alive.current) importPaths(Array.isArray(selected) ? selected : [selected]);
    } catch (reason) { if (alive.current) setError(normalizeError(reason).message); }
  }, [importPaths]);
  useEffect(() => {
    alive.current = true;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauri()) void getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (disposed) return;
      setDragActive(payload.type === 'enter' || payload.type === 'over');
      if (payload.type === 'drop') importPaths(payload.paths);
    }).then((cleanup) => { if (disposed) cleanup(); else unlisten = cleanup; })
      .catch((reason) => { if (!disposed) setError(normalizeError(reason).message); });
    return () => { alive.current = false; disposed = true; unlisten?.(); };
  }, [importPaths]);
  return { choosePhotos, dragActive, error, clearError: () => setError(null) };
}
