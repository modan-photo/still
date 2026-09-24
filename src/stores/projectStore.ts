import { create } from 'zustand';
import type { ImageMeta } from '../types/image';
import type { BorderSpec, RenderSpec } from '../types/renderSpec';

export interface ProjectPhoto extends ImageMeta { id: string; spec: RenderSpec; dirty: boolean }
export type SpecPatch = Partial<Omit<RenderSpec, 'version' | 'source'>>;
interface ProjectState {
  photos: ProjectPhoto[];
  selectedId: string | null;
  addPhotos: (photos: ImageMeta[]) => void;
  selectPhoto: (id: string) => void;
  updateSpec: (id: string, patch: SpecPatch) => void;
  applyBorderToAll: (border: BorderSpec) => void;
  markClean: (id: string, exportedSpec: RenderSpec) => void;
  removePhoto: (id: string) => void;
  clear: () => void;
}
export const useProjectStore = create<ProjectState>((set) => ({
  photos: [], selectedId: null,
  addPhotos: (incoming) => set((state) => {
    const known = new Set(state.photos.map((photo) => photo.path));
    const added = incoming.filter((photo) => {
      if (known.has(photo.path)) return false;
      known.add(photo.path);
      return true;
    }).map((meta): ProjectPhoto => ({ ...meta, id: meta.path, dirty: false,
      spec: { version: 1, source: { path: meta.path, width: meta.width, height: meta.height } } }));
    return { photos: [...state.photos, ...added], selectedId: state.selectedId ?? added[0]?.id ?? null };
  }),
  selectPhoto: (id) => set((state) => state.photos.some((p) => p.id === id) ? { selectedId: id } : state),
  updateSpec: (id, patch) => set((state) => ({ photos: state.photos.map((photo) => photo.id === id
    ? { ...photo, spec: { ...photo.spec, ...structuredClone(patch) }, dirty: true } : photo) })),
  applyBorderToAll: (border) => set((state) => ({ photos: state.photos.map((photo) => ({
    ...photo,
    spec: { ...photo.spec, border: structuredClone(border) },
    dirty: true,
  })) })),
  // Export completion must not clear edits made while the export was running.
  markClean: (id, exportedSpec) => set((state) => ({ photos: state.photos.map((photo) =>
    photo.id === id && JSON.stringify(photo.spec) === JSON.stringify(exportedSpec) ? { ...photo, dirty: false } : photo) })),
  removePhoto: (id) => set((state) => {
    const photos = state.photos.filter((photo) => photo.id !== id);
    return { photos, selectedId: state.selectedId === id ? photos[0]?.id ?? null : state.selectedId };
  }),
  clear: () => set({ photos: [], selectedId: null }),
}));
