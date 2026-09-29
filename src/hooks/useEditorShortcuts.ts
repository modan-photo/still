import { useEffect } from "react";
import { RIGHT_PANEL_TABS } from '../layout/rightPanelTabs';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import { useUndoStore } from '../stores/undoStore';
import { enterCollageMode } from '../services/collageMode';

/**
 * Registers the editor-level keyboard shortcuts for the lifetime of the caller.
 *
 * Store state is read with `getState()` inside the event handler instead of being
 * captured during render. This keeps the listener stable while ensuring every
 * shortcut acts on the latest photo selection and panel state.
 *
 * The hook deliberately ignores keystrokes owned by dialogs, form controls and
 * other interactive widgets so editor shortcuts never interfere with typing or
 * component-specific keyboard handling.
 */
export function useEditorShortcuts(onTogglePanel: () => void, onImport: () => void) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Respect events already handled elsewhere, IME composition and the noisy
      // repeat events emitted while a key is held down.
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      // A modal owns the keyboard while it is open, regardless of its focused child.
      if (target.closest('[role="dialog"]')) return;

      // Escape has a single shell-level responsibility: leave the photo grid.
      if (event.key === "Escape" && useUIStore.getState().gridPanelOpen) {
        event.preventDefault();
        useUIStore.getState().setGridPanelOpen(false);
        return;
      }

      // `G` is available from passive controls such as the canvas, but not while
      // text is being entered. It is also unavailable in collage mode, where the
      // center canvas has a different meaning.
      const textEntryActive = target.isContentEditable || Boolean(target.closest(
        'input, textarea, select, [role="combobox"], [role="dialog"]',
      ));
      if (
        !textEntryActive
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !event.shiftKey
        && event.key.toLowerCase() === "g"
        && useUIStore.getState().activeRightTab !== 'collage'
        && useProjectStore.getState().photos.length >= 2
      ) {
        event.preventDefault();
        useUIStore.getState().toggleGridPanel();
        return;
      }

      // From this point on, avoid stealing keys from any interactive component.
      // The earlier grid shortcut intentionally has a narrower exclusion list.
      if (target.isContentEditable || target.closest(
        'input, textarea, select, button, a, [role="slider"], [role="separator"], [role="combobox"], [role="menu"], [role="listbox"], [role="dialog"]',
      )) return;

      // Use Ctrl on Windows/Linux and Command on macOS for application commands.
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        onImport();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && /^[1-4]$/.test(event.key)) {
        // The compact/mobile inspector does not expose the same four-tab layout.
        if (window.matchMedia('(max-width: 767px)').matches) return;
        const tab = RIGHT_PANEL_TABS[Number(event.key) - 1];
        if (tab) {
          event.preventDefault();
          // Collage needs draft initialization and grid cleanup in addition to a
          // tab change, so it must use the shared mode-entry service.
          if (tab.id === 'collage') enterCollageMode();
          else useUIStore.getState().setActiveRightTab(tab.id);
        }
        return;
      }
      // Remaining shortcuts are intentionally unmodified single-key actions.
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;

      if (
        (event.key === "Delete" || event.key === "Backspace")
        && !useUIStore.getState().gridPanelOpen
      ) {
        const project = useProjectStore.getState();
        const currentId = project.currentPhotoId ?? project.selectedId;
        if (!currentId) return;

        event.preventDefault();
        // `removePhotos` returns a complete snapshot that the undo store can restore.
        useUndoStore.getState().push(project.removePhotos([currentId]));
        return;
      }

      // Tab only toggles the inspector when focus is explicitly within the canvas
      // shortcut scope; normal browser focus navigation remains intact elsewhere.
      if (event.key === "Tab" && target.matches('[data-editor-shortcut-scope="canvas"]')) {
        event.preventDefault();
        console.log("[Editor shortcut] Toggle inspector");
        onTogglePanel();
      } else if (/^[1-5]$/.test(event.key)) {
        // Reserved for the future photo-rating implementation.
        console.log(`[Editor shortcut] Rate photo: ${event.key} (placeholder)`);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        // Navigation is bounded naturally: no state change occurs beyond either end.
        event.preventDefault();
        const { photos, selectedId, selectPhoto } = useProjectStore.getState();
        const index = photos.findIndex((photo) => photo.id === selectedId);
        const next = photos[index + (event.key === 'ArrowLeft' ? -1 : 1)];
        if (next) selectPhoto(next.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    // Re-register when either caller callback changes and always release the global
    // listener during unmount to avoid duplicate shortcut execution.
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTogglePanel, onImport]);
}
