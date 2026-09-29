import { useCallback } from 'react';
import { useProjectStore, type SpecPatch } from '../stores/projectStore';

/**
 * Exposes the render specification for the currently selected photo.
 *
 * The update callback is bound to the selected photo ID captured by the render that
 * produced it. If no photo is selected it becomes a safe no-op, allowing inspector
 * controls to call it without duplicating selection guards.
 */
export function useRenderSpec() {
  // Subscribe only to the selected photo rather than the entire project object so
  // unrelated store updates do not force this hook's consumers to rerender.
  const photo = useProjectStore((state) => state.photos.find((entry) => entry.id === state.selectedId));
  const updateSpec = useProjectStore((state) => state.updateSpec);
  const id = photo?.id;
  // `updateSpec` performs the immutable merge and marks the target photo dirty.
  const update = useCallback((patch: SpecPatch) => {
    if (id) updateSpec(id, patch);
  }, [id, updateSpec]);
  return { spec: photo?.spec ?? null, dirty: photo?.dirty ?? false, update };
}
