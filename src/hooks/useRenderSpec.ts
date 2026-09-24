import { useCallback } from 'react';
import { useProjectStore, type SpecPatch } from '../stores/projectStore';

export function useRenderSpec() {
  const photo = useProjectStore((state) => state.photos.find((entry) => entry.id === state.selectedId));
  const updateSpec = useProjectStore((state) => state.updateSpec);
  const id = photo?.id;
  const update = useCallback((patch: SpecPatch) => {
    if (id) updateSpec(id, patch);
  }, [id, updateSpec]);
  return { spec: photo?.spec ?? null, dirty: photo?.dirty ?? false, update };
}
