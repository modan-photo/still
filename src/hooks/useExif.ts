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

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<ExifData>>();

function cached(photoId: string, path: string): ExifData | null {
  const entry = cache.get(photoId);
  if (!entry || entry.path !== path) return null;
  cache.delete(photoId);
  cache.set(photoId, entry);
  return entry.data;
}

function store(photoId: string, path: string, data: ExifData) {
  cache.delete(photoId);
  cache.set(photoId, { path, data });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

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

function request(photoId: string, path: string): Promise<ExifData> {
  const existing = cached(photoId, path);
  if (existing) return Promise.resolve(existing);

  const inFlight = pending.get(photoId);
  if (inFlight) return inFlight;

  const operation = readExif(path)
    .then((data) => {
      const photoStillExists = useProjectStore
        .getState()
        .photos.some((photo) => photo.id === photoId && photo.path === path);
      if (photoStillExists) store(photoId, path, data);
      return data;
    })
    .finally(() => {
      if (pending.get(photoId) === operation) pending.delete(photoId);
    });
  pending.set(photoId, operation);
  return operation;
}

const unsubscribeFromProject = useProjectStore.subscribe((state, previousState) => {
  if (state.photos === previousState.photos) return;
  const available = new Set(state.photos.map((photo) => photo.id));
  for (const photoId of cache.keys()) {
    if (!available.has(photoId)) cache.delete(photoId);
  }
});

if (import.meta.hot) {
  import.meta.hot.dispose(unsubscribeFromProject);
}

export function useExif(photoId: string | null) {
  const path = useProjectStore((state) =>
    state.photos.find((photo) => photo.id === photoId)?.path ?? null,
  );
  const initialData = photoId && path ? cached(photoId, path) : null;
  const requestKey = photoId && path ? `${photoId}\0${path}` : null;
  const [data, setData] = useState<ExifData | null>(initialData);
  const [dataKey, setDataKey] = useState<string | null>(initialData ? requestKey : null);
  const [loading, setLoading] = useState(Boolean(photoId && path && !initialData));
  const [error, setError] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    if (!photoId || !path) {
      setData(null);
      setDataKey(null);
      setLoading(false);
      setError(null);
      setErrorKey(null);
      return () => {
        current = false;
      };
    }

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
    if (photoId) cache.delete(photoId);
    setRevision((value) => value + 1);
  }, [photoId]);

  const visibleData = dataKey === requestKey ? data : initialData;
  const visibleError = errorKey === requestKey ? error : null;
  const waitingForCurrent = Boolean(requestKey && !visibleData && !visibleError);
  const update = useCallback((edits: ExifEdits) => {
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
