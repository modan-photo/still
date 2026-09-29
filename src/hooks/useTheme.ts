import { useCallback, useEffect, useState } from "react";
import { useUIStore } from '../stores/uiStore';

export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "still-theme";
const mediaQuery = "(prefers-color-scheme: dark)";

/** Read and validate the persisted preference, falling back to the OS setting. */
function getStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

/** Convert the three-way preference into the light/dark theme used for rendering. */
function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(mediaQuery).matches ? "dark" : "light";
}

/**
 * Synchronizes the persisted theme preference, UI store, operating-system color
 * scheme and root document attributes.
 *
 * `preference` records the user's choice (`system`, `light` or `dark`), while
 * `resolvedTheme` is always concrete and can be consumed directly by components.
 */
export function useTheme() {
  const preference = useUIStore((state) => state.theme);
  const setPreferenceState = useUIStore((state) => state.setTheme);
  // Hydrate Zustand from local storage after mount. The store remains the reactive
  // source of truth; local storage is only the persistence layer.
  useEffect(() => { setPreferenceState(getStoredPreference()); }, [setPreferenceState]);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(preference));

  useEffect(() => {
    const query = window.matchMedia(mediaQuery);
    const applyTheme = () => {
      // Explicit light/dark preferences ignore OS changes, but using one listener
      // keeps the effect simple and makes switching back to `system` immediate.
      const resolved = preference === "system" ? (query.matches ? "dark" : "light") : preference;
      setResolvedTheme(resolved);
      // The data attribute drives application tokens; color-scheme also lets native
      // form controls and scrollbars match the resolved theme.
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };

    applyTheme();
    query.addEventListener("change", applyTheme);
    // matchMedia listeners are external to React and must be explicitly released.
    return () => query.removeEventListener("change", applyTheme);
  }, [preference]);

  // Persist first so a reload between this event and the next render still restores
  // the user's latest choice.
  const setPreference = useCallback((nextPreference: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, nextPreference);
    setPreferenceState(nextPreference);
  }, [setPreferenceState]);

  // Toggling from `system` intentionally creates an explicit preference opposite
  // the currently resolved OS theme.
  const toggleResolvedTheme = useCallback(() => {
    setPreference(resolvedTheme === "light" ? "dark" : "light");
  }, [resolvedTheme, setPreference]);

  return { preference, resolvedTheme, setPreference, toggleResolvedTheme };
}

export type ThemeController = ReturnType<typeof useTheme>;
