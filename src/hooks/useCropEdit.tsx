import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { DEFAULT_CROP, DEFAULT_ROTATION, type CropSpec } from '../types/renderSpec';
import { computeTransformEdit, type TransformAction } from '../render/rotation';
import { useEditHistoryStore } from '../stores/editHistoryStore';

interface CropSession { photoId: string; baseline: CropSpec; draft: CropSpec | null; dismissed: boolean }
interface CropEditContextValue {
  session: CropSession | null;
  preview: (photoId: string, crop: CropSpec | null) => void;
  apply: (photoId: string, crop: CropSpec) => void;
  transform: (photoId: string, action: TransformAction) => void;
  resetTransform: (photoId: string) => void;
  cancel: (photoId: string) => void;
  confirm: (photoId: string) => void;
  reopen: (photoId: string) => void;
}
const CropEditContext = createContext<CropEditContextValue | null>(null);

/** Transient React state: pointer moves never write to the photo store. */
export function CropEditProvider({ children }: { children: ReactNode }) {
  const photoId = useProjectStore(state => state.currentPhotoId);
  const tab = useUIStore(state => state.activeRightTab);
  const gridOpen = useUIStore(state => state.gridPanelOpen);
  const historyRevision = useEditHistoryStore(state => state.appliedRevision);
  const [session, setSession] = useState<CropSession | null>(null);
  useEffect(() => {
    // Crop requires the single-photo canvas, including after collage restores its previous view.
    if (tab === 'transform' && gridOpen) useUIStore.getState().setGridPanelOpen(false);
  }, [tab, gridOpen]);
  useEffect(() => {
    const photo = useProjectStore.getState().photos.find(photo => photo.id === photoId);
    setSession(tab === 'transform' && photo ? {
      photoId: photo.id, baseline: structuredClone(photo.spec.crop ?? DEFAULT_CROP), draft: null, dismissed: false,
    } : null);
  }, [photoId, tab, historyRevision]);

  const value: CropEditContextValue = {
    session,
    preview: (id, crop) => setSession(current => current?.photoId === id ? { ...current, draft: crop } : current),
    transform: (id, action) => {
      // Read the latest store value for every click, including rapid repeated clicks.
      const photo = useProjectStore.getState().photos.find(photo => photo.id === id);
      if (!photo) return;
      const rotation = photo.spec.rotation ?? DEFAULT_ROTATION;
      const next = computeTransformEdit(rotation, photo.spec.crop ?? DEFAULT_CROP, action);
      useProjectStore.getState().updateSpec(id, next);
      setSession(current => current?.photoId === id ? {
        ...current,
        baseline: computeTransformEdit(rotation, current.baseline, action).crop,
        draft: current.draft ? computeTransformEdit(rotation, current.draft, action).crop : null,
      } : current);
    },
    resetTransform: id => {
      if (!useProjectStore.getState().photos.some(photo => photo.id === id)) return;
      useProjectStore.getState().updateSpec(id, {
        rotation: structuredClone(DEFAULT_ROTATION), crop: structuredClone(DEFAULT_CROP),
      });
      setSession({ photoId: id, baseline: structuredClone(DEFAULT_CROP), draft: null, dismissed: true });
    },
    apply: (id, crop) => {
      const photo = useProjectStore.getState().photos.find(photo => photo.id === id);
      if (!photo) return;
      const previous = structuredClone(photo.spec.crop ?? DEFAULT_CROP);
      useProjectStore.getState().updateSpec(id, { crop });
      setSession(current => ({
        photoId: id,
        baseline: !crop.enabled ? structuredClone(DEFAULT_CROP)
          : current?.photoId === id && !current.dismissed ? current.baseline : previous,
        draft: null, dismissed: false,
      }));
    },
    cancel: id => {
      if (session?.photoId !== id) return;
      useProjectStore.getState().updateSpec(id, { crop: structuredClone(session.baseline) });
      setSession(current => current?.photoId === id ? { ...current, draft: null, dismissed: false } : current);
    },
    confirm: id => setSession(current => current?.photoId === id ? { ...current, draft: null, dismissed: true } : current),
    reopen: id => {
      const photo = useProjectStore.getState().photos.find(photo => photo.id === id);
      if (photo) setSession({ photoId: id, baseline: structuredClone(photo.spec.crop ?? DEFAULT_CROP), draft: null, dismissed: false });
    },
  };
  return <CropEditContext.Provider value={value}>{children}</CropEditContext.Provider>;
}

export function useCropEdit() {
  const context = useContext(CropEditContext);
  if (!context) throw new Error('Crop editing requires CropEditProvider');
  return context;
}
