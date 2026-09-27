import { useEffect } from "react";
import { RIGHT_PANEL_TABS } from '../layout/rightPanelTabs';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';

/** Register shell shortcuts without connecting photo-editing operations. */
export function useEditorShortcuts(onTogglePanel: () => void, onImport: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.isContentEditable || target.closest(
        'input, textarea, select, button, a, [role="slider"], [role="separator"], [role="combobox"], [role="menu"], [role="listbox"], [role="dialog"]',
      )) return;

      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        onImport();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && /^[1-4]$/.test(event.key)) {
        const tab = RIGHT_PANEL_TABS[Number(event.key) - 1];
        if (tab) {
          event.preventDefault();
          useUIStore.getState().setActiveRightTab(tab.id);
        }
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

      if (event.key === "Tab" && target.matches('[data-editor-shortcut-scope="canvas"]')) {
        event.preventDefault();
        console.log("[Editor shortcut] Toggle inspector");
        onTogglePanel();
      } else if (/^[1-5]$/.test(event.key)) {
        console.log(`[Editor shortcut] Rate photo: ${event.key} (placeholder)`);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const { photos, selectedId, selectPhoto } = useProjectStore.getState();
        const index = photos.findIndex((photo) => photo.id === selectedId);
        const next = photos[index + (event.key === 'ArrowLeft' ? -1 : 1)];
        if (next) selectPhoto(next.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTogglePanel, onImport]);
}
