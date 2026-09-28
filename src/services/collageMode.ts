import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

let gridWasOpenBeforeCollage = false;

export function enterCollageMode() {
  const project = useProjectStore.getState();
  if (project.photos.length < 2) return;
  const available = new Set(project.photos.map((photo) => photo.id));
  const retained = project.collageDraft.photoIds.filter((id) => available.has(id));
  if (retained.length < 2) {
    const selected = project.selectedIds.filter((id) => available.has(id));
    project.updateCollageDraft({ photoIds: selected.length >= 2 ? selected : project.photos.slice(0, 4).map((photo) => photo.id) });
  }
  const ui = useUIStore.getState();
  if (ui.activeRightTab !== 'collage') gridWasOpenBeforeCollage = ui.gridPanelOpen;
  ui.setGridPanelOpen(false);
  ui.setInspectorOpen(true);
  ui.setActiveRightTab('collage');
}

export function restoreViewAfterCollage() {
  const canShowGrid = useProjectStore.getState().photos.length >= 2;
  useUIStore.getState().setGridPanelOpen(gridWasOpenBeforeCollage && canShowGrid);
  gridWasOpenBeforeCollage = false;
}
