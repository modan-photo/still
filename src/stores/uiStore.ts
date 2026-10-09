import { createSessionStore } from './createSessionStore';
import { DEFAULT_RIGHT_PANEL_TAB, type RightPanelTabId } from '../layout/rightPanelTabs';
import {
  readWindowSizePreset,
  WINDOW_SIZE_KEY,
  type WindowSizePreset,
} from '../services/windowPreferences';

export interface UIState {
  inspectorOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  systemFontsEnabled: boolean;
  singleKeyShortcutsEnabled: boolean;
  language: 'en' | 'zh';
  windowSizePreset: WindowSizePreset;
  activeRightTab: RightPanelTabId;
  gridPanelOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  setTheme: (theme: UIState['theme']) => void;
  setSystemFontsEnabled: (enabled: boolean) => void;
  setSingleKeyShortcutsEnabled: (enabled: boolean) => void;
  setLanguage: (language: UIState['language']) => void;
  setWindowSizePreset: (preset: WindowSizePreset) => void;
  setActiveRightTab: (tab: UIState['activeRightTab']) => void;
  setGridPanelOpen: (open: boolean) => void;
  toggleGridPanel: () => void;
  resetSession: () => void;
}
const SYSTEM_FONTS_KEY = 'still.use-system-fonts';
const SINGLE_KEY_SHORTCUTS_KEY = 'still.shortcuts.single-key-enabled';
const storedSystemFontsEnabled = () =>
  typeof localStorage !== 'undefined' && localStorage.getItem(SYSTEM_FONTS_KEY) === 'true';
const storedSingleKeyShortcutsEnabled = () =>
  typeof localStorage === 'undefined' || localStorage.getItem(SINGLE_KEY_SHORTCUTS_KEY) !== 'false';
const LANGUAGE_KEY = 'still.language';
const storedLanguage = (): UIState['language'] => {
  if (typeof localStorage === 'undefined') return 'en';
  return localStorage.getItem(LANGUAGE_KEY) === 'zh' ? 'zh' : 'en';
};

export const useUIStore = createSessionStore<UIState>(
  (set) => ({
    inspectorOpen: true,
    theme: 'system',
    systemFontsEnabled: storedSystemFontsEnabled(),
    singleKeyShortcutsEnabled: storedSingleKeyShortcutsEnabled(),
    language: storedLanguage(),
    windowSizePreset: readWindowSizePreset(),
    activeRightTab: DEFAULT_RIGHT_PANEL_TAB,
    gridPanelOpen: false,
    setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
    setTheme: (theme) => set({ theme }),
    setSystemFontsEnabled: (systemFontsEnabled) => {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem(SYSTEM_FONTS_KEY, String(systemFontsEnabled));
      set({ systemFontsEnabled });
    },
    setSingleKeyShortcutsEnabled: (singleKeyShortcutsEnabled) => {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem(SINGLE_KEY_SHORTCUTS_KEY, String(singleKeyShortcutsEnabled));
      set({ singleKeyShortcutsEnabled });
    },
    setLanguage: (language) => {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_KEY, language);
      set({ language });
    },
    setWindowSizePreset: (windowSizePreset) => {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem(WINDOW_SIZE_KEY, windowSizePreset);
      set({ windowSizePreset });
    },
    setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
    setGridPanelOpen: (gridPanelOpen) => set({ gridPanelOpen }),
    toggleGridPanel: () => set((state) => ({ gridPanelOpen: !state.gridPanelOpen })),
    resetSession: () =>
      set({
        activeRightTab: DEFAULT_RIGHT_PANEL_TAB,
        inspectorOpen: true,
        gridPanelOpen: false,
      }),
  }),
  import.meta.hot?.data.uiStore,
);

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose((data) => {
    data.uiStore = useUIStore;
  });
}
