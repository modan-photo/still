import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "still-theme";
const mediaQuery = "(prefers-color-scheme: dark)";

function getStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia(mediaQuery).matches ? "dark" : "light";
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(getStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => resolveTheme(preference));

  useEffect(() => {
    const query = window.matchMedia(mediaQuery);
    const applyTheme = () => {
      const resolved = preference === "system" ? (query.matches ? "dark" : "light") : preference;
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };

    applyTheme();
    query.addEventListener("change", applyTheme);
    return () => query.removeEventListener("change", applyTheme);
  }, [preference]);

  const setPreference = useCallback((nextPreference: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, nextPreference);
    setPreferenceState(nextPreference);
  }, []);

  const toggleResolvedTheme = useCallback(() => {
    setPreference(resolvedTheme === "light" ? "dark" : "light");
  }, [resolvedTheme, setPreference]);

  return { preference, resolvedTheme, setPreference, toggleResolvedTheme };
}
