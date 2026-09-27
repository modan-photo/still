import { create } from 'zustand';
interface UIState {
  inspectorOpen: boolean;
  viewMode: 'single' | 'grid';
  theme: 'light' | 'dark' | 'system';
  systemFontsEnabled: boolean;
  setInspectorOpen: (open: boolean) => void;
  setViewMode: (mode: UIState['viewMode']) => void;
  setTheme: (theme: UIState['theme']) => void;
  setSystemFontsEnabled: (enabled: boolean) => void;
}
const SYSTEM_FONTS_KEY = 'still.use-system-fonts';
const storedSystemFontsEnabled = () => typeof localStorage !== 'undefined' && localStorage.getItem(SYSTEM_FONTS_KEY) === 'true';
export const useUIStore = create<UIState>((set) => ({
  inspectorOpen: true, viewMode: 'single', theme: 'system', systemFontsEnabled: storedSystemFontsEnabled(),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setViewMode: (viewMode) => set({ viewMode }),
  setTheme: (theme) => set({ theme }),
  setSystemFontsEnabled: (systemFontsEnabled) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SYSTEM_FONTS_KEY, String(systemFontsEnabled));
    set({ systemFontsEnabled });
  },
}));
