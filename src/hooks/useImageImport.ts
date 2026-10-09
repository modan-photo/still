import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import { pickImportDirectory } from '../services/directoryPicker';
import { listImageDirectory, loadImage, normalizeError } from '../services/tauri/image';
import { useProjectStore } from '../stores/projectStore';
import type { ImageMeta } from '../types/image';
import { sourceKey } from '../services/photoCollection';
import { translate } from '../i18n/messages';
import { useUIStore } from '../stores/uiStore';

type ImportNotice =
  | { key: 'importFailedOne' | 'importFailedMany'; count: number; detail: string }
  | { key: 'desktopImportOnly' | 'desktopFolderOnly' | 'folderNoSupported' }
  | { raw: string };

/**
 * Coordinates every image-import entry point: file picker, folder picker and
 * native drag-and-drop.
 *
 * Import requests are serialized, while each request decodes at most two images
 * concurrently. This bounds peak memory and preserves the order in which files
 * were supplied to the application.
 */
export function useImageImport() {
  const language = useUIStore((state) => state.language);
  const [dragActive, setDragActive] = useState(false);
  const [notice, setNotice] = useState<ImportNotice | null>(null);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  // Chaining work onto one promise prevents overlapping picker/drop operations from
  // racing each other or committing photos in an unpredictable order.
  const queue = useRef(Promise.resolve());
  // Async native operations can outlive the component. This ref gates every state
  // and store write after unmount without forcing the native work to be cancelled.
  const alive = useRef(true);
  const importPaths = useCallback((paths: string[], allowCopies = false) => {
    queue.current = queue.current
      .then(async () => {
        // Preserve first-seen order while removing duplicate paths from one request.
        const seen = new Set<string>();
        const unique = paths.filter((path) => {
          const key = sourceKey(path);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const existing = new Set(
          useProjectStore.getState().photos.map((photo) => sourceKey(photo.path)),
        );
        const repeated = allowCopies ? [] : unique.filter((path) => existing.has(sourceKey(path)));
        const pending = allowCopies
          ? unique
          : unique.filter((path) => !existing.has(sourceKey(path)));
        const failures: string[] = [];
        const imported: ImageMeta[] = [];
        if (alive.current) {
          setNotice(null);
          setDuplicates(repeated);
        }
        // Two concurrent decoders bound memory; `allSettled` preserves input order and
        // allows valid images in a batch to survive a sibling failure.
        for (let i = 0; i < pending.length; i += 2) {
          if (!alive.current) break;
          const results = await Promise.allSettled(
            pending.slice(i, i + 2).map((path) => loadImage(path)),
          );
          if (!alive.current) break;
          imported.push(
            ...results.flatMap((result) => {
              if (result.status === 'fulfilled') return [result.value];
              // Cancellation is an intentional stop signal, not a user-facing failure.
              if (normalizeError(result.reason).code === 'cancelled') return [];
              failures.push(normalizeError(result.reason).message);
              return [];
            }),
          );
          // Stop scheduling later batches once any native task reports cancellation.
          if (
            results.some(
              (result) =>
                result.status === 'rejected' && normalizeError(result.reason).code === 'cancelled',
            )
          )
            break;
        }
        // Commit once per request to avoid repeated project rerenders while decoding.
        if (alive.current && imported.length) useProjectStore.getState().addPhotos(imported);
        if (alive.current && failures.length)
          setNotice({
            key: failures.length === 1 ? 'importFailedOne' : 'importFailedMany',
            count: failures.length,
            detail: failures[0],
          });
        // Keep the queue usable after an unexpected failure by handling rejection on
        // the chained promise itself.
      })
      .catch((reason) => {
        if (alive.current) setNotice({ raw: normalizeError(reason).message });
      });
  }, []);

  /** Open the native multi-file picker and enqueue its result. */
  const choosePhotos = useCallback(async () => {
    if (!isTauri()) {
      setNotice({ key: 'desktopImportOnly' });
      return;
    }
    try {
      const selected = await open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: translate(language, 'images'),
            extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff'],
          },
        ],
      });
      if (selected && alive.current) importPaths(Array.isArray(selected) ? selected : [selected]);
    } catch (reason) {
      if (alive.current) setNotice({ raw: normalizeError(reason).message });
    }
  }, [importPaths, language]);
  /** Scan one native folder non-recursively, then enqueue supported image paths. */
  const chooseFolder = useCallback(async () => {
    if (!isTauri()) {
      setNotice({ key: 'desktopFolderOnly' });
      return;
    }
    try {
      const selected = await pickImportDirectory();
      if (!selected || !alive.current) return;
      const paths = await listImageDirectory(selected);
      if (!alive.current) return;
      if (paths.length === 0) {
        setNotice({ key: 'folderNoSupported' });
        return;
      }
      importPaths(paths);
    } catch (reason) {
      if (alive.current) setNotice({ raw: normalizeError(reason).message });
    }
  }, [importPaths]);
  useEffect(() => {
    alive.current = true;
    // `disposed` also covers the interval while the asynchronous listener
    // registration is still waiting to return its cleanup callback.
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauri())
      void getCurrentWebview()
        .onDragDropEvent(({ payload }) => {
          if (disposed) return;
          // Enter/over show the drop affordance; leave/drop clear it.
          setDragActive(payload.type === 'enter' || payload.type === 'over');
          if (payload.type === 'drop') importPaths(payload.paths);
        })
        .then((cleanup) => {
          if (disposed) cleanup();
          else unlisten = cleanup;
        })
        .catch((reason) => {
          if (!disposed) setNotice({ raw: normalizeError(reason).message });
        });
    // Unsubscribe from native events and prevent outstanding imports from writing
    // into an unmounted component.
    return () => {
      alive.current = false;
      disposed = true;
      unlisten?.();
    };
  }, [importPaths]);
  const error = notice
    ? 'raw' in notice
      ? notice.raw
      : translate(
          language,
          notice.key,
          'detail' in notice ? { count: notice.count, detail: notice.detail } : undefined,
        )
    : null;
  return {
    choosePhotos,
    chooseFolder,
    dragActive,
    error,
    clearError: () => setNotice(null),
    duplicates,
    clearDuplicates: () => setDuplicates([]),
    addCopies: () => {
      if (!duplicates.length) return;
      setDuplicates([]);
      importPaths(duplicates, true);
    },
  };
}
