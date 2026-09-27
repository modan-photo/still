import { create } from 'zustand';
import {
  DEFAULT_RIGHT_PANEL_TAB,
  type RightPanelTabId,
} from '../layout/rightPanelTabs';
import { loadUIState, saveUIState } from '../services/tauri/uiState';

export interface UIState {
  inspectorOpen: boolean;
  viewMode: 'single' | 'grid';
  theme: 'light' | 'dark' | 'system';
  systemFontsEnabled: boolean;
  activeRightTab: RightPanelTabId;
  setInspectorOpen: (open: boolean) => void;
  setViewMode: (mode: UIState['viewMode']) => void;
  setTheme: (theme: UIState['theme']) => void;
  setSystemFontsEnabled: (enabled: boolean) => void;
  setActiveRightTab: (tab: UIState['activeRightTab']) => void;
}
const SYSTEM_FONTS_KEY = 'still.use-system-fonts';
const storedSystemFontsEnabled = () => typeof localStorage !== 'undefined' && localStorage.getItem(SYSTEM_FONTS_KEY) === 'true';
let activeRightTabChangedSinceLaunch = false;

export const useUIStore = create<UIState>((set) => ({
  inspectorOpen: true,
  viewMode: 'single',
  theme: 'system',
  systemFontsEnabled: storedSystemFontsEnabled(),
  activeRightTab: DEFAULT_RIGHT_PANEL_TAB,
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setViewMode: (viewMode) => set({ viewMode }),
  setTheme: (theme) => set({ theme }),
  setSystemFontsEnabled: (systemFontsEnabled) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(SYSTEM_FONTS_KEY, String(systemFontsEnabled));
    set({ systemFontsEnabled });
  },
  setActiveRightTab: (activeRightTab) => {
    activeRightTabChangedSinceLaunch = true;
    set({ activeRightTab });
    void saveUIState({ activeRightTab }).catch((error: unknown) => {
      console.warn('Unable to persist the active inspector tab', error);
    });
  },
}));

void loadUIState()
  .then(({ activeRightTab }) => {
    if (!activeRightTabChangedSinceLaunch) {
      useUIStore.setState({ activeRightTab });
    }
  })
  .catch((error: unknown) => {
    console.warn('Unable to restore the active inspector tab', error);
  });
