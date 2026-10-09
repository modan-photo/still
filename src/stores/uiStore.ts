import { createSessionStore } from './createSessionStore';
import { DEFAULT_RIGHT_PANEL_TAB, type RightPanelTabId } from '../layout/rightPanelTabs';
import {
  readWindowSizePreset,
  WINDOW_SIZE_KEY,
  type WindowSizePreset,
} from '../services/windowPreferences';
import type { PhotoSort } from '../services/photoCollection';
import {
  readSingleKeyActions,
  SINGLE_KEY_ACTIONS_KEY,
  readGridShortcutKey,
  GRID_SHORTCUT_KEY,
  readPhotoNavigationKeys,
  PHOTO_NAVIGATION_KEYS_KEY,
  type GridShortcutKey,
  type PhotoNavigationKeys,
  type SingleKeyAction,
  type SingleKeyActions,
} from '../services/shortcutPreferences';

export interface UIState {
  inspectorOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  systemFontsEnabled: boolean;
  singleKeyShortcutsEnabled: boolean;
  singleKeyActions: SingleKeyActions;
  gridShortcutKey: GridShortcutKey;
  photoNavigationKeys: PhotoNavigationKeys;
  language: 'en' | 'zh';
  windowSizePreset: WindowSizePreset;
  photoSort: PhotoSort;
  activeRightTab: RightPanelTabId;
  gridPanelOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  setTheme: (theme: UIState['theme']) => void;
  setSystemFontsEnabled: (enabled: boolean) => void;
  setSingleKeyShortcutsEnabled: (enabled: boolean) => void;
  setSingleKeyActionEnabled: (action: SingleKeyAction, enabled: boolean) => void;
  setGridShortcutKey: (key: GridShortcutKey) => void;
  setPhotoNavigationKeys: (keys: PhotoNavigationKeys) => void;
  setLanguage: (language: UIState['language']) => void;
  setWindowSizePreset: (preset: WindowSizePreset) => void;
  setPhotoSort: (sort: PhotoSort) => void;
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
  (set, get) => ({
    inspectorOpen: true,
    theme: 'system',
    systemFontsEnabled: storedSystemFontsEnabled(),
    singleKeyShortcutsEnabled: storedSingleKeyShortcutsEnabled(),
    singleKeyActions: readSingleKeyActions(),
    gridShortcutKey: readGridShortcutKey(),
    photoNavigationKeys: readPhotoNavigationKeys(),
    language: storedLanguage(),
    windowSizePreset: readWindowSizePreset(),
    photoSort: 'import',
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
    setSingleKeyActionEnabled: (action, enabled) => {
      const singleKeyActions = { ...get().singleKeyActions, [action]: enabled };
      if (typeof localStorage !== 'undefined')
        localStorage.setItem(SINGLE_KEY_ACTIONS_KEY, JSON.stringify(singleKeyActions));
      set({ singleKeyActions });
    },
    setGridShortcutKey: (gridShortcutKey) => {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem(GRID_SHORTCUT_KEY, gridShortcutKey);
      set({ gridShortcutKey });
    },
    setPhotoNavigationKeys: (photoNavigationKeys) => {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem(PHOTO_NAVIGATION_KEYS_KEY, photoNavigationKeys);
      set({ photoNavigationKeys });
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
    setPhotoSort: (photoSort) => set({ photoSort }),
    setActiveRightTab: (activeRightTab) => set({ activeRightTab }),
    setGridPanelOpen: (gridPanelOpen) => set({ gridPanelOpen }),
    toggleGridPanel: () => set((state) => ({ gridPanelOpen: !state.gridPanelOpen })),
    resetSession: () =>
      set({
        activeRightTab: DEFAULT_RIGHT_PANEL_TAB,
        inspectorOpen: true,
        gridPanelOpen: false,
        photoSort: 'import',
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
