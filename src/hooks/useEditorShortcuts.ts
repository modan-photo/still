import { useEffect } from "react";

/** Register shell shortcuts without connecting photo-editing operations. */
export function useEditorShortcuts(onTogglePanel: () => void) {
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
        console.log("[Editor shortcut] Import photos (placeholder)");
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
        console.log(`[Editor shortcut] ${event.key === "ArrowLeft" ? "Previous" : "Next"} photo (placeholder)`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onTogglePanel]);
}
