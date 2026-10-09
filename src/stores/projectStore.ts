import { createSessionStore } from './createSessionStore';
import { hasPendingExifSaves, waitForPendingExifSaves } from '../services/exifSaveCoordinator';
import { getCachedImage, invalidateCache, normalizeError } from '../services/tauri/image';
import type { ImageMeta } from '../types/image';
import {
  DEFAULT_CROP,
  DEFAULT_RENDER_SPEC,
  DEFAULT_ROTATION,
  type BorderSpec,
  type CropAspect,
  type RenderSpec,
  type RotationSpec,
  type WatermarkSpec,
} from '../types/renderSpec';
import { cropForAspect } from '../render/crop';
import { rotatedDimensions, transformBatchDisabledReason } from '../render/rotation';
import { colorTokens } from '../theme/tokens';
import { applyRenderSettings, syncRenderSettings, type SyncModule } from '../render/spec';
import { useEditHistoryStore, type EditChange, type EditStep } from './editHistoryStore';
import { useUIStore } from './uiStore';
import { sortedPhotos } from '../services/photoCollection';

export interface ProjectPhoto extends ImageMeta {
  id: string;
  spec: RenderSpec;
  dirty: boolean;
  thumbRevision: number;
  /** Last imported/exported state, used to keep dirty accurate through undo/redo. */
  cleanSpec?: RenderSpec;
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
  border?: BorderSpec;
  watermark?: WatermarkSpec;
  effectsInitialized?: boolean;
}
export const DEFAULT_COLLAGE_DRAFT: CollageDraft = {
  photoIds: [],
  layout: '2x2',
  gap: 20,
  radius: 0,
  background: { type: 'color', color: colorTokens.light.bg.surface },
  aspect: '1:1',
  effectsInitialized: false,
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
  addPhotos: (photos: ImageMeta[]) => void;
  selectPhoto: (id: string) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelectedId: (id: string) => void;
  updateCollageDraft: (patch: Partial<CollageDraft>) => void;
  resetCollageDraft: () => void;
  updateSpec: (id: string, patch: SpecPatch, options?: { recordHistory?: boolean }) => void;
  undoEdit: () => void;
  redoEdit: () => void;
  applySpecToPhotos: (sourceId: string, targetIds: string[]) => void;
  syncSpecModules: (sourceId: string, targetIds: string[], modules: SyncModule[]) => void;
  applyBorderToAll: (border: BorderSpec) => void;
  applyCropToAll: (sourceId: string, expectedAspect: CropAspect) => number;
  applyTransformToAll: (
    sourceId: string,
    expectedAspect: CropAspect,
    includeRotation?: boolean,
    expectedRotation?: RotationSpec,
  ) => number;
  markClean: (id: string, exportedSpec: RenderSpec) => void;
  removePhotos: (ids: string[]) => RemovePhotosSnapshot;
  restorePhotos: (snapshot: RemovePhotosSnapshot) => void;
  clearAll: () => RemovePhotosSnapshot;
  removePhoto: (id: string) => void;
  clear: () => void;
  resetSession: () => void;
}

const pendingCacheInvalidations: Map<string, Promise<void>> = import.meta.hot?.data
  .pendingCacheInvalidations ?? new Map();
let photoSelectionRequest: number = import.meta.hot?.data.photoSelectionRequest ?? 0;

function invalidatePhotoCaches(photos: ProjectPhoto[]) {
  const hashes = [...new Set(photos.map((photo) => photo.hash).filter(Boolean))];
  if (hashes.length === 0) return;

  const request = invalidateCache(hashes)
    .then(() => undefined)
    .catch((error: unknown) => {
      const normalized = normalizeError(error);
      if (normalized.code !== 'unsupported')
        console.warn('Unable to invalidate removed photo caches', normalized);
    });
  hashes.forEach((hash) => pendingCacheInvalidations.set(hash, request));
  void request.finally(() => {
    hashes.forEach((hash) => {
      if (pendingCacheInvalidations.get(hash) === request) pendingCacheInvalidations.delete(hash);
    });
  });
}

const sameSpec = (left: RenderSpec, right: RenderSpec) =>
  JSON.stringify(left) === JSON.stringify(right);

function editedPhoto(photo: ProjectPhoto, spec: RenderSpec): ProjectPhoto {
  if (sameSpec(photo.spec, spec)) return photo;
  return { ...photo, spec, dirty: photo.cleanSpec ? !sameSpec(spec, photo.cleanSpec) : true };
}

function recordEditChanges(before: ProjectPhoto[], after: ProjectPhoto[], mergeKey?: string) {
  const previous = new Map(before.map((photo) => [photo.id, photo]));
  const changes: EditChange[] = after.flatMap((photo) => {
    const old = previous.get(photo.id);
    if (!old || sameSpec(old.spec, photo.spec)) return [];
    return [
      {
        id: photo.id,
        before: { spec: old.spec, dirty: old.dirty },
        after: { spec: photo.spec, dirty: photo.dirty },
      },
    ];
  });
  useEditHistoryStore.getState().push(changes, mergeKey);
}

function restoreEditStep(photos: ProjectPhoto[], step: EditStep, side: 'before' | 'after') {
  const values = new Map(step.changes.map((change) => [change.id, change[side]]));
  return photos.map((photo) => {
    const value = values.get(photo.id);
    if (!value) return photo;
    const spec = structuredClone(value.spec);
    spec.source = structuredClone(photo.spec.source);
    return {
      ...photo,
      spec,
      dirty: photo.cleanSpec ? !sameSpec(spec, photo.cleanSpec) : value.dirty,
    };
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
          ? {
              ...current,
              thumbUrl: result.value.path,
              thumbRevision: (current.thumbRevision ?? 0) + 1,
            }
          : current;
      }),
    }));
  }
}

export const useProjectStore = createSessionStore<ProjectState>(
  (set, get) => ({
    photos: [],
    selectedIds: [],
    currentPhotoId: null,
    collageDraft: structuredClone(DEFAULT_COLLAGE_DRAFT),
    addPhotos: (incoming) =>
      set((state) => {
        const known = new Set<string>();
        const usedIds = new Set(state.photos.map((photo) => photo.id));
        const added = incoming
          .filter((photo) => {
            if (known.has(photo.path)) return false;
            known.add(photo.path);
            return true;
          })
          .map((meta): ProjectPhoto => {
            let id = meta.path;
            while (usedIds.has(id)) id = crypto.randomUUID();
            usedIds.add(id);
            const spec = structuredClone(DEFAULT_RENDER_SPEC);
            spec.source = { path: meta.path, width: meta.width, height: meta.height };
            return {
              ...meta,
              id,
              dirty: false,
              thumbRevision: 0,
              spec,
              cleanSpec: structuredClone(spec),
            };
          });
        const currentPhotoId = state.currentPhotoId ?? added[0]?.id ?? null;
        return { photos: [...state.photos, ...added], currentPhotoId };
      }),
    selectPhoto: (id) => {
      const request = ++photoSelectionRequest;
      const applySelection = () =>
        set((state) =>
          request === photoSelectionRequest && state.photos.some((photo) => photo.id === id)
            ? { currentPhotoId: id }
            : state,
        );
      if (!hasPendingExifSaves()) {
        applySelection();
        return;
      }
      void waitForPendingExifSaves().then(applySelection);
    },
    setSelectedIds: (ids) =>
      set((state) => {
        const availableIds = new Set(state.photos.map((photo) => photo.id));
        return { selectedIds: [...new Set(ids)].filter((id) => availableIds.has(id)) };
      }),
    toggleSelectedId: (id) =>
      set((state) => {
        if (!state.photos.some((photo) => photo.id === id)) return state;
        return {
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((selectedId) => selectedId !== id)
            : [...state.selectedIds, id],
        };
      }),
    updateCollageDraft: (patch) =>
      set((state) => ({
        collageDraft: {
          ...state.collageDraft,
          ...structuredClone(patch),
          ...(patch.photoIds ? { photoIds: [...new Set(patch.photoIds)] } : {}),
          ...(patch.gap !== undefined ? { gap: Math.min(100, Math.max(0, patch.gap)) } : {}),
          ...(patch.radius !== undefined
            ? { radius: Math.min(40, Math.max(0, patch.radius)) }
            : {}),
        },
      })),
    resetCollageDraft: () =>
      set((state) => ({
        collageDraft: {
          ...structuredClone(DEFAULT_COLLAGE_DRAFT),
          photoIds: [...state.collageDraft.photoIds],
        },
      })),
    updateSpec: (id, patch, options) => {
      const before = get().photos;
      set((state) => ({
        photos: state.photos.map((photo) =>
          photo.id === id
            ? editedPhoto(photo, { ...photo.spec, ...structuredClone(patch) })
            : photo,
        ),
      }));
      const keys = Object.keys(patch);
      const mergeKey =
        keys.length === 1 && ['border', 'watermark', 'adjustments'].includes(keys[0])
          ? `${id}:${keys[0]}`
          : undefined;
      if (options?.recordHistory !== false) recordEditChanges(before, get().photos, mergeKey);
    },
    undoEdit: () => {
      const step = useEditHistoryStore.getState().takeUndo();
      if (step) set((state) => ({ photos: restoreEditStep(state.photos, step, 'before') }));
    },
    redoEdit: () => {
      const step = useEditHistoryStore.getState().takeRedo();
      if (step) set((state) => ({ photos: restoreEditStep(state.photos, step, 'after') }));
    },
    applySpecToPhotos: (sourceId, targetIds) => {
      const before = get().photos;
      set((state) => {
        const template = state.photos.find((photo) => photo.id === sourceId)?.spec;
        if (!template) return state;
        const targets = new Set(targetIds);
        return {
          photos: state.photos.map((photo) =>
            targets.has(photo.id) && photo.id !== sourceId
              ? editedPhoto(photo, applyRenderSettings(photo.spec, template))
              : photo,
          ),
        };
      });
      recordEditChanges(before, get().photos);
    },
    syncSpecModules: (sourceId, targetIds, modules) => {
      const before = get().photos;
      set((state) => {
        const template = state.photos.find((photo) => photo.id === sourceId)?.spec;
        if (!template || modules.length === 0) return state;
        const targets = new Set(targetIds);
        return {
          photos: state.photos.map((photo) =>
            targets.has(photo.id) && photo.id !== sourceId
              ? editedPhoto(photo, syncRenderSettings(photo.spec, template, modules))
              : photo,
          ),
        };
      });
      recordEditChanges(before, get().photos);
    },
    applyBorderToAll: (border) => {
      const before = get().photos;
      set((state) => ({
        photos: state.photos.map((photo) =>
          editedPhoto(photo, { ...photo.spec, border: structuredClone(border) }),
        ),
      }));
      recordEditChanges(before, get().photos);
    },
    applyCropToAll: (sourceId, expectedAspect) => {
      const source = get().photos.find((photo) => photo.id === sourceId);
      const crop = source?.spec.crop;
      if (
        !crop?.enabled ||
        crop.aspect !== expectedAspect ||
        crop.aspect === 'free' ||
        crop.aspect === 'original'
      )
        return 0;
      const count = get().photos.length - 1;
      if (count < 1) return 0;
      const before = get().photos;
      set((state) => ({
        photos: state.photos.map((photo) =>
          photo.id === sourceId
            ? photo
            : editedPhoto(photo, {
                ...photo.spec,
                crop: cropForAspect(crop.aspect, photo.spec.source.width, photo.spec.source.height),
              }),
        ),
      }));
      recordEditChanges(before, get().photos);
      return count;
    },
    applyTransformToAll: (sourceId, expectedAspect, includeRotation = false, expectedRotation) => {
      const state = get();
      const source = state.photos.find((photo) => photo.id === sourceId);
      if (!source) return 0;
      const crop = source.spec.crop ?? DEFAULT_CROP;
      const rotation = source.spec.rotation ?? DEFAULT_ROTATION;
      if (
        crop.aspect !== expectedAspect ||
        transformBatchDisabledReason(crop, rotation, state.photos.length)
      )
        return 0;
      if (
        expectedRotation &&
        (rotation.angle !== expectedRotation.angle ||
          rotation.flipH !== expectedRotation.flipH ||
          rotation.flipV !== expectedRotation.flipV)
      )
        return 0;
      set({
        photos: state.photos.map((photo) => {
          const targetRotation = includeRotation ? rotation : photo.spec.rotation;
          const size = rotatedDimensions(
            photo.spec.source.width,
            photo.spec.source.height,
            targetRotation,
          );
          return editedPhoto(photo, {
            ...photo.spec,
            ...(includeRotation ? { rotation: structuredClone(rotation) } : {}),
            // Omitting the current crop produces the maximal centered rectangle.
            crop: cropForAspect(crop.aspect, size.width, size.height),
          });
        }),
      });
      recordEditChanges(state.photos, get().photos);
      return state.photos.length;
    },
    // Export completion must not clear edits made while the export was running.
    markClean: (id, exportedSpec) =>
      set((state) => ({
        photos: state.photos.map((photo) =>
          photo.id === id && sameSpec(photo.spec, exportedSpec)
            ? { ...photo, dirty: false, cleanSpec: structuredClone(exportedSpec) }
            : photo,
        ),
      })),
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
      const previousCurrentId = state.currentPhotoId;
      const snapshot: RemovePhotosSnapshot = {
        removedPhotos,
        removedIndices,
        previousCurrentId,
        previousSelectedIds: [...state.selectedIds],
        previousCollagePhotoIds: [...state.collageDraft.photoIds],
      };
      if (removedPhotos.length === 0) return snapshot;

      useEditHistoryStore.getState().prunePhotos(removedPhotos.map((photo) => photo.id));

      const photos = state.photos.filter((photo) => !targetIds.has(photo.id));
      let currentPhotoId = previousCurrentId;
      if (previousCurrentId && targetIds.has(previousCurrentId)) {
        const orderedPhotos = sortedPhotos(state.photos, useUIStore.getState().photoSort);
        const currentIndex = orderedPhotos.findIndex((photo) => photo.id === previousCurrentId);
        const nextPhoto = orderedPhotos
          .slice(currentIndex + 1)
          .find((photo) => !targetIds.has(photo.id));
        const previousPhoto = orderedPhotos
          .slice(0, currentIndex)
          .reverse()
          .find((photo) => !targetIds.has(photo.id));
        currentPhotoId = nextPhoto?.id ?? previousPhoto?.id ?? null;
      } else if (currentPhotoId && !photos.some((photo) => photo.id === currentPhotoId)) {
        currentPhotoId = photos[0]?.id ?? null;
      }

      set({
        photos,
        selectedIds: state.selectedIds.filter((id) => !targetIds.has(id)),
        currentPhotoId,
        collageDraft: {
          ...state.collageDraft,
          photoIds: state.collageDraft.photoIds.filter((id) => !targetIds.has(id)),
        },
      });
      invalidatePhotoCaches(removedPhotos);
      return snapshot;
    },
    restorePhotos: (snapshot) => {
      set((state) => {
        const photos = [...state.photos];
        const indexedPhotos = snapshot.removedPhotos
          .map((photo, snapshotIndex) => ({
            photo,
            index: snapshot.removedIndices[snapshotIndex] ?? photos.length,
          }))
          .sort((left, right) => left.index - right.index);
        for (const entry of indexedPhotos) {
          if (photos.some((photo) => photo.id === entry.photo.id)) continue;
          photos.splice(Math.min(Math.max(0, entry.index), photos.length), 0, entry.photo);
        }
        const availableIds = new Set(photos.map((photo) => photo.id));
        const currentPhotoId =
          snapshot.previousCurrentId && availableIds.has(snapshot.previousCurrentId)
            ? snapshot.previousCurrentId
            : state.currentPhotoId && availableIds.has(state.currentPhotoId)
              ? state.currentPhotoId
              : (photos[0]?.id ?? null);
        return {
          photos,
          selectedIds: snapshot.previousSelectedIds.filter((id) => availableIds.has(id)),
          currentPhotoId,
          collageDraft: {
            ...state.collageDraft,
            photoIds: (snapshot.previousCollagePhotoIds ?? []).filter((id) => availableIds.has(id)),
          },
        };
      });
      void regenerateRestoredThumbnails(snapshot.removedPhotos);
    },
    clearAll: () => get().removePhotos(get().photos.map((photo) => photo.id)),
    removePhoto: (id) => {
      get().removePhotos([id]);
    },
    clear: () => {
      get().clearAll();
    },
    resetSession: () => {
      useEditHistoryStore.getState().clear();
      photoSelectionRequest++;
      set({
        photos: [],
        selectedIds: [],
        currentPhotoId: null,
        collageDraft: structuredClone(DEFAULT_COLLAGE_DRAFT),
      });
    },
  }),
  import.meta.hot?.data.projectStore,
);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.projectStore = useProjectStore;
    data.pendingCacheInvalidations = pendingCacheInvalidations;
    data.photoSelectionRequest = photoSelectionRequest;
  });
}
