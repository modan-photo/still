import { useCallback, useEffect, useState } from "react";
import { readExif } from "../services/tauri/exif";
import { normalizeError } from "../services/tauri/image";
import { useProjectStore } from "../stores/projectStore";
import type { ExifData, ExifEdits } from "../types/exif";

const MAX_CACHE_ENTRIES = 50;

type CacheEntry = {
  path: string;
  data: ExifData;
};

// Module-level state is shared by every EXIF panel instance. Reopening a photo can
// therefore reuse its metadata without storing large EXIF objects in project state.
const cache = new Map<string, CacheEntry>();
// One promise per photo prevents duplicate native reads when multiple consumers
// request the same metadata before the first request completes.
const pending = new Map<string, Promise<ExifData>>();

/** Return a valid entry and promote it to the most-recently-used position. */
function cached(photoId: string, path: string): ExifData | null {
  const entry = cache.get(photoId);
  if (!entry || entry.path !== path) return null;
  cache.delete(photoId);
  cache.set(photoId, entry);
  return entry.data;
}

/** Insert metadata into the bounded least-recently-used cache. */
function store(photoId: string, path: string, data: ExifData) {
  cache.delete(photoId);
  cache.set(photoId, { path, data });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Apply editable fields without discarding read-only camera or exposure metadata. */
function applyEdits(data: ExifData, edits: ExifEdits): ExifData {
  return {
    ...data,
    other: {
      ...data.other,
      ...(edits.artist !== undefined ? { artist: edits.artist } : {}),
      ...(edits.copyright !== undefined ? { copyright: edits.copyright } : {}),
      ...(edits.keywords !== undefined ? { keywords: edits.keywords } : {}),
    },
  };
}

/** Resolve EXIF data from cache, an in-flight request, or the native reader. */
function request(photoId: string, path: string): Promise<ExifData> {
  const existing = cached(photoId, path);
  if (existing) return Promise.resolve(existing);

  const inFlight = pending.get(photoId);
  if (inFlight) return inFlight;

  const operation = readExif(path)
    .then((data) => {
      // A read may finish after its photo was removed or replaced. Only cache the
      // result when both identity and path still match the current project.
      const photoStillExists = useProjectStore
        .getState()
        .photos.some((photo) => photo.id === photoId && photo.path === path);
      if (photoStillExists) store(photoId, path, data);
      return data;
    })
    .finally(() => {
      // Do not remove a newer request that may have replaced this promise.
      if (pending.get(photoId) === operation) pending.delete(photoId);
    });
  pending.set(photoId, operation);
  return operation;
}

// Purge metadata for deleted photos. Comparing the array reference avoids scanning
// the cache for unrelated project-store updates.
const unsubscribeFromProject = useProjectStore.subscribe((state, previousState) => {
  if (state.photos === previousState.photos) return;
  const available = new Set(state.photos.map((photo) => photo.id));
  for (const photoId of cache.keys()) {
    if (!available.has(photoId)) cache.delete(photoId);
  }
});

// Vite preserves modules across hot reloads; dispose the old subscription so HMR
// does not accumulate duplicate store listeners during development.
if (import.meta.hot) {
  import.meta.hot.dispose(unsubscribeFromProject);
}

/**
 * Loads and caches the selected photo's EXIF data.
 *
 * State values are tagged with a request key containing both photo ID and path.
 * That tag prevents a slow response for the previous selection from flashing in
 * the panel after the user moves to another photo.
 */
export function useExif(photoId: string | null) {
  const path = useProjectStore((state) =>
    state.photos.find((photo) => photo.id === photoId)?.path ?? null,
  );
  // Read the cache synchronously so an already-known photo renders without a
  // one-frame loading state.
  const initialData = photoId && path ? cached(photoId, path) : null;
  // The NUL separator cannot occur in a filesystem path and avoids ambiguous keys.
  const requestKey = photoId && path ? `${photoId}\0${path}` : null;
  const [data, setData] = useState<ExifData | null>(initialData);
  const [dataKey, setDataKey] = useState<string | null>(initialData ? requestKey : null);
  const [loading, setLoading] = useState(Boolean(photoId && path && !initialData));
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    // Effects cannot cancel the native EXIF read itself. This flag prevents a
    // completed request from mutating React state after cleanup or selection change.
    let current = true;
    if (!photoId || !path) {
      // No selection means the panel should immediately return to its empty state.
      setData(null);
      setDataKey(null);
      setLoading(false);
      setError(null);
      setErrorKey(null);
      return () => {
        current = false;
      };
    }

    // Check again inside the effect because another hook may have populated the
    // shared cache between render and effect execution.
    const hit = cached(photoId, path);
    if (hit) {
      setData(hit);
      setDataKey(requestKey);
      setLoading(false);
      setError(null);
      setErrorKey(null);
      return () => {
        current = false;
      };
    }

    // Clear stale state before starting a request for the new photo.
    setData(null);
    setDataKey(null);
    setLoading(true);
    setError(null);
    setErrorKey(null);
    void request(photoId, path)
      .then((result) => {
        if (current) {
          setData(result);
          setDataKey(requestKey);
        }
      })
      .catch((reason: unknown) => {
        if (current) {
          setError(normalizeError(reason).message);
          setErrorKey(requestKey);
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [path, photoId, requestKey, revision]);

  const retry = useCallback(() => {
    // Eviction forces `request` to bypass the cached value; revision reruns the
    // effect even though the selected ID and path are unchanged.
    if (photoId) cache.delete(photoId);
    setRevision((value) => value + 1);
  }, [photoId]);

  // Only expose state belonging to the current request. This closes the short gap
  // between a prop change and the cleanup/effect for that change.
  const visibleData = dataKey === requestKey ? data : initialData;
  const visibleError = errorKey === requestKey ? error : null;
  const waitingForCurrent = Boolean(requestKey && !visibleData && !visibleError);
  const update = useCallback((edits: ExifEdits) => {
    // EXIF writes happen elsewhere; this method updates the local cache immediately
    // after a successful write so the inspector reflects the persisted values.
    if (!photoId || !path || !requestKey) return;
    const current = cached(photoId, path) ?? (dataKey === requestKey ? data : null);
    if (!current) return;
    const next = applyEdits(current, edits);
    store(photoId, path, next);
    setData(next);
    setDataKey(requestKey);
  }, [data, dataKey, path, photoId, requestKey]);

  return {
    data: visibleData,
    loading: !visibleData && (loading || waitingForCurrent),
    error: visibleError,
    retry,
    update,
  };
}
