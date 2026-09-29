import { create } from 'zustand';
import { hasPendingExifSaves, waitForPendingExifSaves } from '../services/exifSaveCoordinator';
import { getCachedImage, invalidateCache, normalizeError } from '../services/tauri/image';
import type { ImageMeta } from '../types/image';
import type { BorderSpec, RenderSpec } from '../types/renderSpec';
import { colorTokens } from '../theme/tokens';
import { applyRenderSettings, syncRenderSettings, type SyncModule } from '../render/spec';

export interface ProjectPhoto extends ImageMeta {
  id: string;
  spec: RenderSpec;
  dirty: boolean;
  thumbRevision: number;
}
export type CollageLayout = '1x2' | '1x3' | '2x1' | '2x2' | '2x3' | '3x3' | 'v-strip' | 'h-strip';
export type CollageAspect = '1:1' | '4:3' | '16:9' | '9:16' | 'auto';
export interface CollageDraft {
  photoIds: string[];
  layout: CollageLayout;
  gap: number;
  radius: number;
  background: { type: 'color' | 'transparent'; color: string };
  aspect: CollageAspect;
}
export const DEFAULT_COLLAGE_DRAFT: CollageDraft = {
  photoIds: [],
  layout: '2x2',
  gap: 20,
  radius: 0,
  background: { type: 'color', color: colorTokens.light.bg.surface },
  aspect: '1:1',
};
export type SpecPatch = Partial<Omit<RenderSpec, 'version' | 'source'>>;
export interface RemovePhotosSnapshot {
  removedPhotos: ProjectPhoto[];
  removedIndices: number[];
  previousCurrentId: string | null;
  previousSelectedIds: string[];
  previousCollagePhotoIds: string[];
}

export interface ProjectState {
  photos: ProjectPhoto[];
  selectedIds: string[];
  currentPhotoId: string | null;
  collageDraft: CollageDraft;
  /** @deprecated Use currentPhotoId. Kept temporarily for existing consumers. */
  selectedId: string | null;
  addPhotos: (photos: ImageMeta[]) => void;
  selectPhoto: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  updateCollageDraft: (patch: Partial<CollageDraft>) => void;
  resetCollageDraft: () => void;
  updateSpec: (id: string, patch: SpecPatch) => void;
  applySpecToPhotos: (sourceId: string, targetIds: string[]) => void;
  syncSpecModules: (sourceId: string, targetIds: string[], modules: SyncModule[]) => void;
  applyBorderToAll: (border: BorderSpec) => void;
  markClean: (id: string, exportedSpec: RenderSpec) => void;
  removePhotos: (ids: string[]) => RemovePhotosSnapshot;
  restorePhotos: (snapshot: RemovePhotosSnapshot) => void;
  clearAll: () => RemovePhotosSnapshot;
  removePhoto: (id: string) => void;
  clear: () => void;
}

const pendingCacheInvalidations = new Map<string, Promise<void>>();
let photoSelectionRequest = 0;

function invalidatePhotoCaches(photos: ProjectPhoto[]) {
  const hashes = [...new Set(photos.map((photo) => photo.hash).filter(Boolean))];
  if (hashes.length === 0) return;

  const request = invalidateCache(hashes)
    .then(() => undefined)
    .catch((error: unknown) => {
      const normalized = normalizeError(error);
      if (normalized.code !== 'unsupported') console.warn('Unable to invalidate removed photo caches', normalized);
    });
  hashes.forEach((hash) => pendingCacheInvalidations.set(hash, request));
  void request.finally(() => {
    hashes.forEach((hash) => {
      if (pendingCacheInvalidations.get(hash) === request) pendingCacheInvalidations.delete(hash);
    });
  });
}

async function regenerateRestoredThumbnails(photos: ProjectPhoto[]) {
  const pending = photos
    .map((photo) => pendingCacheInvalidations.get(photo.hash))
    .filter((request): request is Promise<void> => Boolean(request));
  await Promise.all(pending);

  for (let index = 0; index < photos.length; index += 2) {
    const batch = photos.slice(index, index + 2);
    const results = await Promise.allSettled(
      batch.map((photo) => getCachedImage(photo.path, 'thumbnail')),
    );
    useProjectStore.setState((state) => ({
      photos: state.photos.map((current) => {
        const restoredIndex = batch.findIndex((photo) => photo.id === current.id);
        if (restoredIndex < 0) return current;
        const result = results[restoredIndex];
        return result.status === 'fulfilled'
          ? { ...current, thumbUrl: result.value.path, thumbRevision: (current.thumbRevision ?? 0) + 1 }
          : current;
      }),
    }));
  }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  photos: [], selectedIds: [], currentPhotoId: null, selectedId: null,
  collageDraft: structuredClone(DEFAULT_COLLAGE_DRAFT),
  addPhotos: (incoming) => set((state) => {
    const known = new Set(state.photos.map((photo) => photo.path));
    const added = incoming.filter((photo) => {
      if (known.has(photo.path)) return false;
      known.add(photo.path);
      return true;
    }).map((meta): ProjectPhoto => ({ ...meta, id: meta.path, dirty: false, thumbRevision: 0,
      spec: { version: 1, source: { path: meta.path, width: meta.width, height: meta.height } } }));
    const currentPhotoId = state.currentPhotoId ?? state.selectedId ?? added[0]?.id ?? null;
    return { photos: [...state.photos, ...added], currentPhotoId, selectedId: currentPhotoId };
  }),
  selectPhoto: (id) => {
    const request = ++photoSelectionRequest;
    const applySelection = () => set((state) => (
      request === photoSelectionRequest && state.photos.some((photo) => photo.id === id)
        ? { currentPhotoId: id, selectedId: id }
        : state
    ));
    if (!hasPendingExifSaves()) {
      applySelection();
      return;
    }
    void waitForPendingExifSaves().then(applySelection);
  },
  setSelectedIds: (ids) => set((state) => {
    const availableIds = new Set(state.photos.map((photo) => photo.id));
    return { selectedIds: [...new Set(ids)].filter((id) => availableIds.has(id)) };
  }),
  toggleSelectedId: (id) => set((state) => {
    if (!state.photos.some((photo) => photo.id === id)) return state;
    return {
      selectedIds: state.selectedIds.includes(id)
        ? state.selectedIds.filter((selectedId) => selectedId !== id)
        : [...state.selectedIds, id],
    };
  }),
  updateCollageDraft: (patch) => set((state) => ({
    collageDraft: {
      ...state.collageDraft,
      ...structuredClone(patch),
      ...(patch.photoIds ? { photoIds: [...new Set(patch.photoIds)] } : {}),
      ...(patch.gap !== undefined ? { gap: Math.min(100, Math.max(0, patch.gap)) } : {}),
      ...(patch.radius !== undefined ? { radius: Math.min(40, Math.max(0, patch.radius)) } : {}),
    },
  })),
  resetCollageDraft: () => set((state) => ({ collageDraft: { ...structuredClone(DEFAULT_COLLAGE_DRAFT), photoIds: [...state.collageDraft.photoIds] } })),
  updateSpec: (id, patch) => set((state) => ({ photos: state.photos.map((photo) => photo.id === id
    ? { ...photo, spec: { ...photo.spec, ...structuredClone(patch) }, dirty: true } : photo) })),
  applySpecToPhotos: (sourceId, targetIds) => set((state) => {
    const template = state.photos.find((photo) => photo.id === sourceId)?.spec;
    if (!template) return state;
    const targets = new Set(targetIds);
    return {
      photos: state.photos.map((photo) => targets.has(photo.id) && photo.id !== sourceId
        ? { ...photo, spec: applyRenderSettings(photo.spec, template), dirty: true }
        : photo),
    };
  }),
  syncSpecModules: (sourceId, targetIds, modules) => set((state) => {
    const template = state.photos.find((photo) => photo.id === sourceId)?.spec;
    if (!template || modules.length === 0) return state;
    const targets = new Set(targetIds);
    return {
      photos: state.photos.map((photo) => targets.has(photo.id) && photo.id !== sourceId
        ? { ...photo, spec: syncRenderSettings(photo.spec, template, modules), dirty: true }
        : photo),
    };
  }),
  applyBorderToAll: (border) => set((state) => ({ photos: state.photos.map((photo) => ({
    ...photo,
    spec: { ...photo.spec, border: structuredClone(border) },
    dirty: true,
  })) })),
  // Export completion must not clear edits made while the export was running.
  markClean: (id, exportedSpec) => set((state) => ({ photos: state.photos.map((photo) =>
    photo.id === id && JSON.stringify(photo.spec) === JSON.stringify(exportedSpec) ? { ...photo, dirty: false } : photo) })),
  removePhotos: (ids) => {
    const state = get();
    const targetIds = new Set(ids);
    const removedPhotos: ProjectPhoto[] = [];
    const removedIndices: number[] = [];
    state.photos.forEach((photo, index) => {
      if (!targetIds.has(photo.id)) return;
      removedPhotos.push(photo);
      removedIndices.push(index);
    });
    const previousCurrentId = state.currentPhotoId ?? state.selectedId;
    const snapshot: RemovePhotosSnapshot = {
      removedPhotos,
      removedIndices,
      previousCurrentId,
      previousSelectedIds: [...state.selectedIds],
      previousCollagePhotoIds: [...state.collageDraft.photoIds],
    };
    if (removedPhotos.length === 0) return snapshot;

    const photos = state.photos.filter((photo) => !targetIds.has(photo.id));
    let currentPhotoId = previousCurrentId;
    if (previousCurrentId && targetIds.has(previousCurrentId)) {
      const currentIndex = state.photos.findIndex((photo) => photo.id === previousCurrentId);
      const nextPhoto = state.photos.slice(currentIndex + 1).find((photo) => !targetIds.has(photo.id));
      const previousPhoto = state.photos.slice(0, currentIndex).reverse().find((photo) => !targetIds.has(photo.id));
      currentPhotoId = nextPhoto?.id ?? previousPhoto?.id ?? null;
    } else if (currentPhotoId && !photos.some((photo) => photo.id === currentPhotoId)) {
      currentPhotoId = photos[0]?.id ?? null;
    }

    set({
      photos,
      selectedIds: state.selectedIds.filter((id) => !targetIds.has(id)),
      currentPhotoId,
      selectedId: currentPhotoId,
      collageDraft: { ...state.collageDraft, photoIds: state.collageDraft.photoIds.filter((id) => !targetIds.has(id)) },
    });
    invalidatePhotoCaches(removedPhotos);
    return snapshot;
  },
  restorePhotos: (snapshot) => {
    set((state) => {
      const photos = [...state.photos];
      const indexedPhotos = snapshot.removedPhotos
        .map((photo, snapshotIndex) => ({ photo, index: snapshot.removedIndices[snapshotIndex] ?? photos.length }))
        .sort((left, right) => left.index - right.index);
      for (const entry of indexedPhotos) {
        if (photos.some((photo) => photo.id === entry.photo.id)) continue;
        photos.splice(Math.min(Math.max(0, entry.index), photos.length), 0, entry.photo);
      }
      const availableIds = new Set(photos.map((photo) => photo.id));
      const currentPhotoId = snapshot.previousCurrentId && availableIds.has(snapshot.previousCurrentId)
        ? snapshot.previousCurrentId
        : state.currentPhotoId && availableIds.has(state.currentPhotoId)
          ? state.currentPhotoId
          : photos[0]?.id ?? null;
      return {
        photos,
        selectedIds: snapshot.previousSelectedIds.filter((id) => availableIds.has(id)),
        currentPhotoId,
        selectedId: currentPhotoId,
        collageDraft: { ...state.collageDraft, photoIds: (snapshot.previousCollagePhotoIds ?? []).filter((id) => availableIds.has(id)) },
      };
    });
    void regenerateRestoredThumbnails(snapshot.removedPhotos);
  },
  clearAll: () => get().removePhotos(get().photos.map((photo) => photo.id)),
  removePhoto: (id) => { get().removePhotos([id]); },
  clear: () => { get().clearAll(); },
}));
